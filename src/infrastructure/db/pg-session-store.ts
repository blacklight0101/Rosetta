import { z } from 'zod';
import type {
  CreatedSession,
  NewSession,
  Session,
  SessionStore,
} from '../../application/ports/session-store.js';
import {
  cutUserAgent,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  sessionExpiresAt,
} from '../../domain/accounts/session-rules.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { hashSessionId, isSessionIdForm, newSessionId } from '../security/session-ids.js';
import type { DatabasePool } from './pool.js';

// Architecture section 7, ADR-016, RF-1101: sessions in PostgreSQL, looked up by the SHA-256 of
// the id (`id_hash`); the id itself is never stored. `touch` moves `last_seen_at` and recomputes
// `expires_at` = min(last_seen_at + 8 h, created_at + 7 days) in one statement, and deletes the
// session instead when it has expired. A database failure is thrown as RST-2404 with the cause.

const SESSION_COLUMNS =
  'user_id::text AS user_id, created_at, last_seen_at, expires_at, ip, user_agent';
const INSERT =
  'INSERT INTO sessions (id_hash, user_id, created_at, last_seen_at, expires_at, ip, user_agent) VALUES ($1, $2, $3, $3, $4, $5, $6)';
const TOUCH =
  "UPDATE sessions SET last_seen_at = $2, expires_at = LEAST($2::timestamptz + $3::double precision * interval '1 millisecond', created_at + $4::double precision * interval '1 millisecond') WHERE id_hash = $1 AND expires_at > $2 RETURNING " +
  SESSION_COLUMNS;
const DELETE_EXPIRED_ONE = 'DELETE FROM sessions WHERE id_hash = $1 AND expires_at <= $2';
const DELETE_ONE = 'DELETE FROM sessions WHERE id_hash = $1';
const DELETE_FOR_USER = 'DELETE FROM sessions WHERE user_id = $1';
const PURGE = 'DELETE FROM sessions WHERE expires_at <= $1';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const sessionRow = z.object({
  user_id: z.string(),
  created_at: z.date(),
  last_seen_at: z.date(),
  expires_at: z.date(),
  ip: z.string(),
  user_agent: z.string(),
});

function toSession(row: unknown): Session {
  const parsed = sessionRow.parse(row);
  return {
    userId: parsed.user_id,
    createdAt: parsed.created_at,
    lastSeenAt: parsed.last_seen_at,
    expiresAt: parsed.expires_at,
    ip: parsed.ip,
    userAgent: parsed.user_agent,
  };
}

function queryFailed(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
}

export class PgSessionStore implements SessionStore {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  async create(input: NewSession): Promise<CreatedSession> {
    const id = newSessionId();
    const now = input.now.getTime();
    const session: Session = {
      userId: input.userId,
      createdAt: input.now,
      lastSeenAt: input.now,
      expiresAt: new Date(sessionExpiresAt(now, now)),
      ip: input.ip,
      userAgent: cutUserAgent(input.userAgent),
    };
    await this.run(INSERT, [
      hashSessionId(id),
      session.userId,
      session.createdAt,
      session.expiresAt,
      session.ip,
      session.userAgent,
    ]);
    return { id, session };
  }

  async touch(id: string, now: Date): Promise<Session | undefined> {
    if (!isSessionIdForm(id)) return undefined;
    const hash = hashSessionId(id);
    const touched = await this.run(TOUCH, [
      hash,
      now,
      SESSION_IDLE_TIMEOUT_MS,
      SESSION_ABSOLUTE_TIMEOUT_MS,
    ]);
    const [row] = touched.rows;
    if (row !== undefined) return toSession(row);
    await this.run(DELETE_EXPIRED_ONE, [hash, now]);
    return undefined;
  }

  async end(id: string): Promise<boolean> {
    if (!isSessionIdForm(id)) return false;
    return (await this.run(DELETE_ONE, [hashSessionId(id)])).count === 1;
  }

  async endAllForUser(userId: string): Promise<number> {
    if (!UUID.test(userId)) return 0;
    return (await this.run(DELETE_FOR_USER, [userId])).count;
  }

  async purgeExpired(now: Date): Promise<number> {
    return (await this.run(PURGE, [now])).count;
  }

  private async run(sql: string, values: unknown[]): Promise<{ rows: unknown[]; count: number }> {
    try {
      const result = await this.pool.query<Record<string, unknown>>(sql, values);
      return { rows: result.rows, count: result.rowCount ?? 0 };
    } catch (error) {
      throw queryFailed(error);
    }
  }
}

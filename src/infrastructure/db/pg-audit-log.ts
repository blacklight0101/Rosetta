import type {
  AuditEvent,
  AuditEventInput,
  AuditFilter,
  AuditLog,
} from '../../application/ports/audit-log.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { TextMasker } from '../guards/secret-masker.js';
import {
  maskedDetailJson,
  storedAuditFilter,
  storedAuditText,
  toAuditEvent,
} from './audit-rows.js';
import type { DatabasePool } from './pool.js';

// Architecture section 7, ADR-016, RF-1109: the audit trail in `audit_events`. The app role may
// only insert and select (data-model.md section 6). The detail is masked and every NUL in the
// text is replaced before it is stored (P1-77); the filter is compared the same way (P1-101).

export const AUDIT_INSERT =
  'INSERT INTO audit_events (at, actor_user_id, action, target_type, target_id, ip, outcome, detail) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)';
const LIST =
  'SELECT id::text AS id, at, actor_user_id::text AS actor_user_id, action, target_type, target_id, ip, outcome, detail FROM audit_events WHERE at >= $1 AND ($2::uuid IS NULL OR actor_user_id = $2::uuid) AND ($3::text IS NULL OR action = $3::text) AND ($5::text IS NULL OR outcome = $5::text) ORDER BY at DESC, id DESC LIMIT $4';

/** The values of an audit row as stored by `AUDIT_INSERT`: detail masked, text without NULs. */
// RF-1109
export function auditRowValues(event: AuditEventInput, masker: TextMasker): unknown[] {
  const text = storedAuditText(event);
  return [
    event.at,
    event.actorUserId,
    text.action,
    text.targetType,
    text.targetId,
    text.ip,
    event.outcome,
    maskedDetailJson(event.detail, masker),
  ];
}

function queryFailed(error: unknown): RosettaError {
  return new RosettaError(ERROR_CODES.databaseQueryFailed, undefined, { cause: error });
}

export class PgAuditLog implements AuditLog {
  private readonly pool: DatabasePool;
  private readonly masker: TextMasker;

  constructor(pool: DatabasePool, masker: TextMasker) {
    this.pool = pool;
    this.masker = masker;
  }

  async record(event: AuditEventInput): Promise<void> {
    try {
      await this.pool.query(AUDIT_INSERT, auditRowValues(event, this.masker));
    } catch (error) {
      throw queryFailed(error);
    }
  }

  async list(filter: AuditFilter): Promise<readonly AuditEvent[]> {
    // Not a UUID cannot name a user; asking PostgreSQL would fail on the uuid cast. A NUL in the
    // action would fail as a text parameter; the stored actions hold U+FFFD instead (P1-101).
    const stored = storedAuditFilter(filter);
    if (stored === null) return [];
    const values = [
      new Date(stored.since),
      stored.actorUserId ?? null,
      stored.action ?? null,
      stored.limit ?? null,
      stored.outcome ?? null,
    ];
    let rows: unknown[];
    try {
      rows = (await this.pool.query<Record<string, unknown>>(LIST, values)).rows;
    } catch (error) {
      throw queryFailed(error);
    }
    return rows.map(toAuditEvent);
  }
}

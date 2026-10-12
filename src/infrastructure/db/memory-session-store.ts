import type {
  CreatedSession,
  NewSession,
  Session,
  SessionStore,
} from '../../application/ports/session-store.js';
import {
  cutUserAgent,
  isSessionExpired,
  sessionExpiresAt,
} from '../../domain/accounts/session-rules.js';
import { hashSessionId, isSessionIdForm, newSessionId } from '../security/session-ids.js';

// Architecture section 7, RF-1101: sessions in memory, for tests. Like PgSessionStore it keeps
// only the SHA-256 of each id and passes the same contract suite. Unit tests may hand in their own
// id source, so they use no randomness; the ids must have the form of `newSessionId`.

export interface MemorySessionStoreOptions {
  readonly newId?: () => string;
}

interface StoredSession {
  readonly userId: string;
  readonly createdAt: number;
  readonly lastSeenAt: number;
  readonly expiresAt: number;
  readonly ip: string;
  readonly userAgent: string;
}

function toSession(stored: StoredSession): Session {
  return {
    userId: stored.userId,
    createdAt: new Date(stored.createdAt),
    lastSeenAt: new Date(stored.lastSeenAt),
    expiresAt: new Date(stored.expiresAt),
    ip: stored.ip,
    userAgent: stored.userAgent,
  };
}

/** The map key of an id: its hash in hexadecimal; undefined for a malformed id. */
function keyOf(id: string): string | undefined {
  return isSessionIdForm(id) ? hashSessionId(id).toString('hex') : undefined;
}

export class MemorySessionStore implements SessionStore {
  private readonly sessions = new Map<string, StoredSession>();
  private readonly newId: () => string;

  constructor(options: MemorySessionStoreOptions = {}) {
    this.newId = options.newId ?? newSessionId;
  }

  /** The stored keys (hashes in hexadecimal), so tests can check that no id is kept. */
  storedKeys(): readonly string[] {
    return [...this.sessions.keys()];
  }

  create(input: NewSession): Promise<CreatedSession> {
    const id = this.newId();
    const now = input.now.getTime();
    const stored: StoredSession = {
      userId: input.userId,
      createdAt: now,
      lastSeenAt: now,
      expiresAt: sessionExpiresAt(now, now),
      ip: input.ip,
      userAgent: cutUserAgent(input.userAgent),
    };
    this.sessions.set(hashSessionId(id).toString('hex'), stored);
    return Promise.resolve({ id, session: toSession(stored) });
  }

  touch(id: string, now: Date): Promise<Session | undefined> {
    const key = keyOf(id);
    const stored = key === undefined ? undefined : this.sessions.get(key);
    if (key === undefined || stored === undefined) return Promise.resolve(undefined);
    if (isSessionExpired(stored.expiresAt, now.getTime())) {
      this.sessions.delete(key);
      return Promise.resolve(undefined);
    }
    const touched = {
      ...stored,
      lastSeenAt: now.getTime(),
      expiresAt: sessionExpiresAt(stored.createdAt, now.getTime()),
    };
    this.sessions.set(key, touched);
    return Promise.resolve(toSession(touched));
  }

  end(id: string): Promise<boolean> {
    const key = keyOf(id);
    return Promise.resolve(key !== undefined && this.sessions.delete(key));
  }

  endAllForUser(userId: string): Promise<number> {
    return Promise.resolve(this.deleteWhere((stored) => stored.userId === userId));
  }

  purgeExpired(now: Date): Promise<number> {
    return Promise.resolve(
      this.deleteWhere((stored) => isSessionExpired(stored.expiresAt, now.getTime())),
    );
  }

  private deleteWhere(matches: (stored: StoredSession) => boolean): number {
    const keys = [...this.sessions].filter(([, stored]) => matches(stored)).map(([key]) => key);
    for (const key of keys) this.sessions.delete(key);
    return keys.length;
  }
}

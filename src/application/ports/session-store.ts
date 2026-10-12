// Architecture section 7, RF-1101, ADR-015: server-side sessions. The store makes the random
// 256-bit id, hands it out once for the cookie and keeps only its SHA-256; every other call takes
// the id from the cookie and looks the session up by its hash. A session expires at
// min(last seen + 8 h, created + 7 days); `touch` ends an expired session instead of extending it.

export interface NewSession {
  readonly userId: string;
  readonly ip: string;
  /** Cut to 200 characters by the store. */
  readonly userAgent: string;
  readonly now: Date;
}

export interface Session {
  readonly userId: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly ip: string;
  readonly userAgent: string;
}

export interface CreatedSession {
  /** The id for the cookie; never stored, never logged, never in a response body. */
  readonly id: string;
  readonly session: Session;
}

export interface SessionStore {
  create(input: NewSession): Promise<CreatedSession>;
  /**
   * The live session of this id with `lastSeenAt` moved to `now`; undefined for an unknown or
   * malformed id, and for an expired session, which is deleted.
   */
  touch(id: string, now: Date): Promise<Session | undefined>;
  /** Deletes the session; false when there was none. */
  end(id: string): Promise<boolean>;
  /** Deletes every session of the user; the number deleted. */
  endAllForUser(userId: string): Promise<number>;
  /** Deletes every session expired at `now`; the number deleted (the hourly purge). */
  purgeExpired(now: Date): Promise<number>;
}

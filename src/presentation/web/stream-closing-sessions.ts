import type {
  CreatedSession,
  NewSession,
  Session,
  SessionStore,
} from '../../application/ports/session-store.js';
import type { StreamRegistry } from './event-stream.js';

// RF-1101, P1-160: the session store every use case is given. Ending a session (sign-out) ends the
// open event streams of that session, and ending every session of a user (an administrator's
// disable or reset, a password change, a disabled account found at the next request) ends every
// open stream of that user, so a stream never outlives the session it was opened in.

export class StreamClosingSessionStore implements SessionStore {
  readonly #inner: SessionStore;
  readonly #streams: StreamRegistry;

  constructor(inner: SessionStore, streams: StreamRegistry) {
    this.#inner = inner;
    this.#streams = streams;
  }

  create(input: NewSession): Promise<CreatedSession> {
    return this.#inner.create(input);
  }

  touch(id: string, now: Date): Promise<Session | undefined> {
    return this.#inner.touch(id, now);
  }

  // RF-1101
  async end(id: string): Promise<boolean> {
    const ended = await this.#inner.end(id);
    this.#streams.endSession(id);
    return ended;
  }

  // RF-1101
  async endAllForUser(userId: string): Promise<number> {
    const ended = await this.#inner.endAllForUser(userId);
    this.#streams.endUser(userId);
    return ended;
  }

  purgeExpired(now: Date): Promise<number> {
    return this.#inner.purgeExpired(now);
  }
}

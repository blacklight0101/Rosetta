import {
  actorOf,
  sessionUserOf,
  type Actor,
  type SessionUser,
} from '../../domain/accounts/actor.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { SessionStore } from '../ports/session-store.js';
import type { UserRepository } from '../ports/user-repository.js';

// RF-1009, RF-1101: turns the session cookie of a request into the signed-in actor. The session
// is touched (its idle timeout moves on); an expired session is ended by the store. When the
// account behind a live session is disabled or gone, every session of that account is ended, so a
// disabled user is signed out at the next request.

export interface SignedInSession {
  /** The id from the cookie, for sign-out only; never sent in a body. */
  readonly sessionId: string;
  readonly actor: Actor;
  readonly user: SessionUser;
}

export interface ResolveSessionDependencies {
  readonly sessions: SessionStore;
  readonly users: UserRepository;
  readonly logger: Logger;
  readonly clock: Clock;
}

export class ResolveSession {
  private readonly deps: ResolveSessionDependencies;

  constructor(deps: ResolveSessionDependencies) {
    this.deps = deps;
  }

  /** The signed-in session of this id, or undefined when there is none. */
  // RF-1009, RF-1101
  async execute(sessionId: string): Promise<SignedInSession | undefined> {
    const { sessions, users, logger, clock } = this.deps;
    const session = await sessions.touch(sessionId, clock.now());
    if (session === undefined) return undefined;
    const account = await users.findById(session.userId);
    if (account === undefined || account.state === 'Disabled') {
      const ended = await sessions.endAllForUser(session.userId);
      await logger.log({
        level: 'info',
        logger: 'accounts',
        message: `Ended ${String(ended)} session(s) of a disabled account.`,
        userId: session.userId,
      });
      return undefined;
    }
    return { sessionId, actor: actorOf(account), user: sessionUserOf(account) };
  }
}

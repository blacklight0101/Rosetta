import type { Actor } from '../../domain/accounts/actor.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { SessionStore } from '../ports/session-store.js';

// RF-1101, RF-1109: Sign out deletes the session on the server (the route clears the cookie) and
// writes an audit row and an `info` entry.

export interface SignOutRequest {
  readonly actor: Actor;
  /** The id from the cookie of this request. */
  readonly sessionId: string;
  readonly ip: string;
}

export interface SignOutDependencies {
  readonly sessions: SessionStore;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
}

export class SignOut {
  private readonly deps: SignOutDependencies;

  constructor(deps: SignOutDependencies) {
    this.deps = deps;
  }

  // RF-1101
  async execute(request: SignOutRequest): Promise<void> {
    const { sessions, auditLog, logger, clock } = this.deps;
    await sessions.end(request.sessionId);
    await auditLog.record({
      at: clock.now(),
      actorUserId: request.actor.userId,
      action: 'auth.sign_out',
      targetType: 'user',
      targetId: request.actor.userId,
      ip: request.ip,
      outcome: 'ok',
      detail: {},
    });
    await logger.log({
      level: 'info',
      logger: 'accounts',
      message: 'Signed out.',
      userId: request.actor.userId,
    });
  }
}

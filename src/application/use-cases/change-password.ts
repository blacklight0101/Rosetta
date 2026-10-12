import { changePassword } from '../../domain/accounts/account-transitions.js';
import { sessionUserOf, type Actor, type SessionUser } from '../../domain/accounts/actor.js';
import {
  checkNewPassword,
  type CommonPasswordList,
  type PasswordProblem,
} from '../../domain/accounts/password-rules.js';
import type { UserAccount } from '../../domain/accounts/user.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { SessionStore } from '../ports/session-store.js';
import type { UserRepository } from '../ports/user-repository.js';

// RF-1103, RF-1102, RF-1109, ADR-015: the signed-in user changes their password. The current
// password is verified first (RST-2211, audited and logged as a security event); the new one must
// meet the P1-08 rules. The account becomes Active (MustChangePassword is cleared), every session
// of the account ends, and a new session is opened for the browser that made the change, so "my
// other sessions are ended" and the session id rotates with the credential. Neither password is
// ever logged or audited.

export interface ChangePasswordRequest {
  readonly actor: Actor;
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly ip: string;
  readonly userAgent: string;
}

export interface PasswordChanged {
  /** The new session id of this browser, for the cookie only. */
  readonly sessionId: string;
  readonly user: SessionUser;
}

export type ChangePasswordProblem =
  | PasswordProblem
  | typeof ERROR_CODES.currentPasswordIncorrect
  | typeof ERROR_CODES.accountStateInvalid
  | typeof ERROR_CODES.notFound;

export interface ChangePasswordDependencies {
  readonly users: UserRepository;
  readonly hasher: PasswordHasher;
  readonly sessions: SessionStore;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly commonPasswords: CommonPasswordList;
}

const ACTION = 'user.password_changed';

export class ChangePassword {
  private readonly deps: ChangePasswordDependencies;

  constructor(deps: ChangePasswordDependencies) {
    this.deps = deps;
  }

  // RF-1103
  async execute(
    request: ChangePasswordRequest,
  ): Promise<Result<PasswordChanged, ChangePasswordProblem>> {
    const { users, hasher, commonPasswords } = this.deps;
    const account = await users.findById(request.actor.userId);
    if (account === undefined) return err(ERROR_CODES.notFound);
    if (!(await hasher.verify(request.currentPassword, account.passwordHash))) {
      return this.refuseCurrent(account, request.ip);
    }
    const rules = checkNewPassword(request.newPassword, account.userName, commonPasswords);
    if (!rules.ok) return err(rules.error);
    const now = this.deps.clock.now();
    const changed = changePassword(account, await hasher.hash(rules.value), now.getTime());
    if (!changed.ok) return changed;
    await users.update(changed.value);
    return ok(await this.rotateSessions(changed.value, request, now));
  }

  private async rotateSessions(
    account: UserAccount,
    request: ChangePasswordRequest,
    now: Date,
  ): Promise<PasswordChanged> {
    const { sessions, auditLog, logger } = this.deps;
    const ended = await sessions.endAllForUser(account.id);
    const created = await sessions.create({
      userId: account.id,
      ip: request.ip,
      userAgent: request.userAgent,
      now,
    });
    await auditLog.record({
      at: now,
      actorUserId: account.id,
      action: ACTION,
      targetType: 'user',
      targetId: account.id,
      ip: request.ip,
      outcome: 'ok',
      detail: { endedSessions: ended },
    });
    await logger.log({
      level: 'info',
      logger: 'accounts',
      message: 'Changed the password; the other sessions were ended.',
      userId: account.id,
    });
    return { sessionId: created.id, user: sessionUserOf(account) };
  }

  private async refuseCurrent(
    account: UserAccount,
    ip: string,
  ): Promise<Result<never, ChangePasswordProblem>> {
    await this.deps.auditLog.record({
      at: this.deps.clock.now(),
      actorUserId: account.id,
      action: ACTION,
      targetType: 'user',
      targetId: account.id,
      ip,
      outcome: 'refused',
      detail: { reason: 'current-password-incorrect' },
    });
    await this.deps.logger.securityEvent(ERROR_CODES.currentPasswordIncorrect, {
      message: 'Refused a password change: the current password was not correct.',
      userId: account.id,
      data: { ip },
    });
    return err(ERROR_CODES.currentPasswordIncorrect);
  }
}

import { changePassword } from '../../domain/accounts/account-transitions.js';
import { sessionUserOf, type Actor, type SessionUser } from '../../domain/accounts/actor.js';
import {
  checkNewPassword,
  type CommonPasswordList,
  type PasswordProblem,
} from '../../domain/accounts/password-rules.js';
import { isLocked } from '../../domain/accounts/sign-in-failures.js';
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
// password is verified first (RST-2211, audited and logged as a security event); a wrong one counts
// toward the sign-in failure window (RF-1100, DEC-112), so the fifth within 15 minutes locks the
// account and a locked account is refused without a check. The new one must meet the P1-08 rules
// and differ from the current one (RST-2214), or a forced change could keep the password. The
// account becomes Active (MustChangePassword is cleared) with clear counters, written only if its
// state, update time and password hash are still as read (an administrator's disable or reset
// wins, RST-2208). Every
// session of the account ends and a new one is opened for the browser that made the change, so
// "my other sessions are ended" and the session id rotates with the credential. Neither password
// is ever logged or audited.

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
  | typeof ERROR_CODES.passwordUnchanged
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
    if (isLocked(account, this.deps.clock.now().getTime())) {
      return this.refuseCurrent(account, request.ip, 'locked');
    }
    if (!(await hasher.verify(request.currentPassword, account.passwordHash))) {
      return this.failCurrent(account, request.ip);
    }
    // The current password was just verified, so an equal new one is the stored password.
    if (request.newPassword === request.currentPassword) return err(ERROR_CODES.passwordUnchanged);
    const rules = checkNewPassword(request.newPassword, account.userName, commonPasswords);
    if (!rules.ok) return err(rules.error);
    return this.save(account, await hasher.hash(rules.value), request);
  }

  private async save(
    account: UserAccount,
    passwordHash: string,
    request: ChangePasswordRequest,
  ): Promise<Result<PasswordChanged, ChangePasswordProblem>> {
    const now = this.deps.clock.now();
    const changed = changePassword(account, passwordHash, now.getTime());
    if (!changed.ok) return changed;
    const cleared = { ...changed.value, failedSignIns: 0, firstFailedAt: null, lockedUntil: null };
    if (!(await this.deps.users.updateIfCurrent(cleared, account))) {
      return err(ERROR_CODES.accountStateInvalid);
    }
    return ok(await this.rotateSessions(cleared, request, now));
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

  /** Counts the failure in the sign-in window (RF-1100); the fifth locks the account. */
  private async failCurrent(
    account: UserAccount,
    ip: string,
  ): Promise<Result<never, ChangePasswordProblem>> {
    const now = this.deps.clock.now();
    // One atomic write of the counters only (P1-86): parallel wrong guesses each count, and a
    // concurrent disable or reset by an administrator is never undone.
    const locked = await this.deps.users.countFailedSignIn(account.id, now.getTime());
    const refused = await this.refuseCurrent(account, ip, 'current-password-incorrect');
    if (locked) await this.recordLock(account, ip, now);
    return refused;
  }

  private async recordLock(account: UserAccount, ip: string, now: Date): Promise<void> {
    await this.deps.auditLog.record({
      at: now,
      actorUserId: account.id,
      action: 'auth.locked',
      targetType: 'user',
      targetId: account.id,
      ip,
      outcome: 'refused',
      detail: { failures: 5, lockedMinutes: 15, source: 'password-change' },
    });
    await this.deps.logger.securityEvent(ERROR_CODES.accountLocked, {
      message: 'Locked an account for 15 minutes after five failed password checks.',
      userId: account.id,
      data: { ip },
    });
  }

  private async refuseCurrent(
    account: UserAccount,
    ip: string,
    reason: 'locked' | 'current-password-incorrect',
  ): Promise<Result<never, ChangePasswordProblem>> {
    await this.deps.auditLog.record({
      at: this.deps.clock.now(),
      actorUserId: account.id,
      action: ACTION,
      targetType: 'user',
      targetId: account.id,
      ip,
      outcome: 'refused',
      detail: { reason },
    });
    await this.deps.logger.securityEvent(ERROR_CODES.currentPasswordIncorrect, {
      message: `Refused a password change (${reason}).`,
      userId: account.id,
      data: { ip },
    });
    return err(ERROR_CODES.currentPasswordIncorrect);
  }
}

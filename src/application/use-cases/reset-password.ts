import { resetPassword } from '../../domain/accounts/account-transitions.js';
import type { Actor } from '../../domain/accounts/actor.js';
import {
  checkNewPassword,
  type CommonPasswordList,
  type PasswordProblem,
} from '../../domain/accounts/password-rules.js';
import type { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { summaryOf, type AccountSummary } from '../accounts/account-summary.js';
import { administeredAccount, type AdministeredProblem } from '../accounts/administered-account.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { PasswordHasher } from '../ports/password-hasher.js';
import type { SessionStore } from '../ports/session-store.js';
import type { UserRepository } from '../ports/user-repository.js';

// RF-1102, RF-1101, RF-1109: an administrator sets a new password for another account. It must
// meet the RF-1103 rules; the account must change it at its next sign-in (MustChangePassword),
// every session of the account ends at once, and a `user.password_reset` audit row is written
// without the password. A disabled account is enabled first (RST-2208).

export interface ResetPasswordRequest {
  readonly actor: Actor;
  readonly userId: string;
  readonly password: string;
  readonly ip: string;
}

export type ResetPasswordProblem =
  AdministeredProblem | PasswordProblem | typeof ERROR_CODES.accountStateInvalid;

export interface ResetPasswordDependencies {
  readonly users: UserRepository;
  readonly hasher: PasswordHasher;
  readonly sessions: SessionStore;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
  readonly commonPasswords: CommonPasswordList;
}

export class ResetPassword {
  private readonly deps: ResetPasswordDependencies;

  constructor(deps: ResetPasswordDependencies) {
    this.deps = deps;
  }

  // RF-1102
  async execute(
    request: ResetPasswordRequest,
  ): Promise<Result<AccountSummary, ResetPasswordProblem>> {
    const { users, hasher, sessions, clock } = this.deps;
    const target = await administeredAccount(users, request.actor, request.userId);
    if (!target.ok) return target;
    const rules = checkNewPassword(
      request.password,
      target.value.userName,
      this.deps.commonPasswords,
    );
    if (!rules.ok) return err(rules.error);
    const now = clock.now();
    const reset = resetPassword(target.value, await hasher.hash(rules.value), now.getTime());
    if (!reset.ok) return reset;
    await users.update(reset.value);
    const ended = await sessions.endAllForUser(reset.value.id);
    await this.deps.auditLog.record({
      at: now,
      actorUserId: request.actor.userId,
      action: 'user.password_reset',
      targetType: 'user',
      targetId: reset.value.id,
      ip: request.ip,
      outcome: 'ok',
      detail: { endedSessions: ended },
    });
    await this.deps.logger.log({
      level: 'info',
      logger: 'accounts',
      message: 'An administrator reset the password of an account.',
      userId: request.actor.userId,
      data: { targetUserId: reset.value.id },
    });
    return ok(summaryOf(reset.value, now.getTime()));
  }
}

import { disableAccount, enableAccount } from '../../domain/accounts/account-transitions.js';
import type { Actor } from '../../domain/accounts/actor.js';
import type { UserAccount } from '../../domain/accounts/user.js';
import type { ERROR_CODES } from '../../domain/errors/codes.js';
import { ok, type Result } from '../../domain/errors/result.js';
import { summaryOf, type AccountSummary } from '../accounts/account-summary.js';
import { administeredAccount, type AdministeredProblem } from '../accounts/administered-account.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { SessionStore } from '../ports/session-store.js';
import type { UserRepository } from '../ports/user-repository.js';

// RF-1102, RF-1101, RF-1109: an administrator disables or enables another account. Disabling takes
// effect at once: every session of the account ends (the session hook would also end them at the
// next request). Enabling is allowed only for a disabled account (RST-2208) and clears the
// lockout counters. Each change writes a `user.disabled` or `user.enabled` audit row.

export type AccountChange = 'disable' | 'enable';

export interface UpdateUserRequest {
  readonly actor: Actor;
  readonly userId: string;
  readonly change: AccountChange;
  readonly ip: string;
}

export type UpdateUserProblem = AdministeredProblem | typeof ERROR_CODES.accountStateInvalid;

export interface UpdateUserDependencies {
  readonly users: UserRepository;
  readonly sessions: SessionStore;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
}

export class UpdateUser {
  private readonly deps: UpdateUserDependencies;

  constructor(deps: UpdateUserDependencies) {
    this.deps = deps;
  }

  // RF-1102
  async execute(request: UpdateUserRequest): Promise<Result<AccountSummary, UpdateUserProblem>> {
    const { users, sessions, clock } = this.deps;
    const target = await administeredAccount(users, request.actor, request.userId);
    if (!target.ok) return target;
    const now = clock.now();
    const changed = applyChange(target.value, request.change, now.getTime());
    if (!changed.ok) return changed;
    await users.update(changed.value);
    const ended = request.change === 'disable' ? await sessions.endAllForUser(changed.value.id) : 0;
    await this.record(request, now, ended);
    return ok(summaryOf(changed.value, now.getTime()));
  }

  private async record(request: UpdateUserRequest, now: Date, ended: number): Promise<void> {
    const disabled = request.change === 'disable';
    await this.deps.auditLog.record({
      at: now,
      actorUserId: request.actor.userId,
      action: disabled ? 'user.disabled' : 'user.enabled',
      targetType: 'user',
      targetId: request.userId,
      ip: request.ip,
      outcome: 'ok',
      detail: disabled ? { endedSessions: ended } : {},
    });
    await this.deps.logger.log({
      level: 'info',
      logger: 'accounts',
      message: disabled
        ? 'An administrator disabled an account.'
        : 'An administrator enabled an account.',
      userId: request.actor.userId,
      data: { targetUserId: request.userId },
    });
  }
}

function applyChange(
  account: UserAccount,
  change: AccountChange,
  now: number,
): Result<UserAccount, typeof ERROR_CODES.accountStateInvalid> {
  return change === 'disable' ? ok(disableAccount(account, now)) : enableAccount(account, now);
}

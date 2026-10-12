import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { AuditLog } from '../ports/audit-log.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { UserRepository } from '../ports/user-repository.js';

// DEC-107, RF-1106, RF-1109: the signed-in user sets or removes (null) the optional daily cap on
// their own keys. Runs on their own keys then stop before they would pass it in a UTC day; it does
// not touch the cap the administrator sets for server keys. A cap below zero is refused (RST-1003).
// The write is conditional on the account as it was read, so a concurrent change by an
// administrator (a disable, a reset) is never overwritten (RST-2208); a change writes a
// `user.own_daily_cap_changed` audit row with the new and the previous figure.

export interface SetOwnDailyCapRequest {
  readonly actor: Actor;
  /** Micro-dollars; null removes the cap. */
  readonly capMicros: bigint | null;
  readonly ip: string;
}

export type SetOwnDailyCapProblem =
  | typeof ERROR_CODES.settingsCapNegative
  | typeof ERROR_CODES.notFound
  | typeof ERROR_CODES.accountStateInvalid;

export interface SetOwnDailyCapDependencies {
  readonly users: UserRepository;
  readonly auditLog: AuditLog;
  readonly logger: Logger;
  readonly clock: Clock;
}

const textOf = (micros: bigint | null): string | null => micros?.toString() ?? null;

export class SetOwnDailyCap {
  private readonly deps: SetOwnDailyCapDependencies;

  constructor(deps: SetOwnDailyCapDependencies) {
    this.deps = deps;
  }

  // RF-1106
  async execute(
    request: SetOwnDailyCapRequest,
  ): Promise<Result<bigint | null, SetOwnDailyCapProblem>> {
    const { actor, capMicros, ip } = request;
    if (capMicros !== null && capMicros < 0n) return err(ERROR_CODES.settingsCapNegative);
    const { users, auditLog, logger, clock } = this.deps;
    const account = await users.findById(actor.userId);
    if (account === undefined) return err(ERROR_CODES.notFound);
    const at = clock.now();
    const changed = { ...account, ownDailyCapMicros: capMicros, updatedAt: at.getTime() };
    if (!(await users.updateIfCurrent(changed, account)))
      return err(ERROR_CODES.accountStateInvalid);
    const detail = {
      ownDailyCapMicros: textOf(capMicros),
      previousOwnDailyCapMicros: textOf(account.ownDailyCapMicros),
    };
    await auditLog.record({
      ...{ at, actorUserId: actor.userId, action: 'user.own_daily_cap_changed', ip },
      ...{ targetType: 'user', targetId: actor.userId, outcome: 'ok', detail },
    });
    await logger.log({
      level: 'info',
      logger: 'budget',
      message: 'A user changed the daily cap on their own keys.',
      userId: actor.userId,
      data: detail,
    });
    return ok(capMicros);
  }
}

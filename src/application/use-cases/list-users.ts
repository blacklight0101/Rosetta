import type { Actor } from '../../domain/accounts/actor.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import { summaryOf, type AccountSummary } from '../accounts/account-summary.js';
import type { AccountUsage, CurrencyTotal } from '../ports/account-usage.js';
import type { Clock } from '../ports/clock.js';
import type { UserRepository } from '../ports/user-repository.js';

// RF-1102: the administration page shows every account with its last sign-in, its number of
// projects and its month-to-date cost: a read-only sum over the cost ledger from the start of the
// current UTC calendar month (DEC-107), per currency. Only an administrator lists accounts.

export interface ListUsersRequest {
  readonly actor: Actor;
}

export interface ListedAccount extends AccountSummary {
  readonly projects: number;
  /** Spend since the start of the UTC month, per currency; empty when nothing was spent. */
  readonly monthToDate: readonly CurrencyTotal[];
}

export interface ListUsersDependencies {
  readonly users: UserRepository;
  readonly usage: AccountUsage;
  readonly clock: Clock;
}

/** The first instant of the UTC calendar month of `now` (DEC-107). */
function utcMonthStart(now: Date): number {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}

export class ListUsers {
  private readonly deps: ListUsersDependencies;

  constructor(deps: ListUsersDependencies) {
    this.deps = deps;
  }

  // RF-1102
  async execute(
    request: ListUsersRequest,
  ): Promise<Result<readonly ListedAccount[], typeof ERROR_CODES.notAllowed>> {
    if (request.actor.role !== 'admin') return err(ERROR_CODES.notAllowed);
    const now = this.deps.clock.now();
    const [users, usage] = await Promise.all([
      this.deps.users.list(),
      this.deps.usage.byUser(utcMonthStart(now)),
    ]);
    return ok(
      users.map((user) => {
        const used = usage.get(user.id);
        return {
          ...summaryOf(user, now.getTime()),
          projects: used?.projects ?? 0,
          monthToDate: used?.spent ?? [],
        };
      }),
    );
  }
}

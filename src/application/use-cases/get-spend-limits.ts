import type { Actor } from '../../domain/accounts/actor.js';
import { utcPeriodsOf } from '../../domain/budget/utc-periods.js';
import type { AccountUsage, CurrencyTotal } from '../ports/account-usage.js';
import type { Clock } from '../ports/clock.js';
import type { ServerSettings } from '../ports/server-settings.js';
import type { UserRepository } from '../ports/user-repository.js';

// RF-1106, RF-1001, DEC-107, DEC-108: what the start page needs to warn that an estimate is above
// what is left. For the signed-in user only:
// - the day on the server's keys: the cap that applies (the administrator's figure for the account,
//   else the server default), what the user spent today on the server's keys and what is left;
// - the server's month on its keys: only what is left, since the figure of the whole server is the
//   administrator's (the totals pill); spend on users' own keys is not in it (RF-1106);
// - the day on the user's own keys: their own cap, when they set one, with what they spent on their
//   own keys today and what is left.
// Spend is the ledger's USD total of the UTC day or month (this release prices in dollars, DEC-54);
// what is left is never below zero. Calls reserved but not yet settled are not counted: the budget
// guard still stops a run that would pass a cap.

export interface Amounts {
  readonly capMicros: bigint;
  readonly spentMicros: bigint;
  readonly remainingMicros: bigint;
}

export interface SpendLimits {
  readonly serverKeys: {
    readonly userDay: Amounts;
    readonly serverMonth: { readonly remainingMicros: bigint };
  };
  readonly ownKeys: { readonly day: Amounts | null };
}

export interface GetSpendLimitsDependencies {
  readonly users: UserRepository;
  readonly settings: ServerSettings;
  readonly usage: AccountUsage;
  readonly clock: Clock;
}

const CURRENCY = 'USD';

function usd(totals: readonly CurrencyTotal[]): bigint {
  return totals
    .filter((total) => total.currency === CURRENCY)
    .reduce((sum, total) => sum + total.costMicros, 0n);
}

function amountsOf(capMicros: bigint, spentMicros: bigint): Amounts {
  const left = capMicros - spentMicros;
  return { capMicros, spentMicros, remainingMicros: left < 0n ? 0n : left };
}

export class GetSpendLimits {
  private readonly deps: GetSpendLimitsDependencies;

  constructor(deps: GetSpendLimitsDependencies) {
    this.deps = deps;
  }

  // RF-1106, DEC-107
  async execute(request: { readonly actor: Actor }): Promise<SpendLimits> {
    const { users, settings, usage, clock } = this.deps;
    const { userId } = request.actor;
    const periods = utcPeriodsOf(clock.now());
    const [account, caps, today, month] = await Promise.all([
      users.findById(userId),
      settings.caps(),
      usage.userDay(userId, periods.dayStart),
      usage.serverMonth(periods.monthStart),
    ]);
    const ownCap = account?.ownDailyCapMicros ?? null;
    return {
      serverKeys: {
        userDay: amountsOf(account?.dailyCapMicros ?? caps.userDayMicros, usd(today.server)),
        serverMonth: {
          remainingMicros: amountsOf(caps.serverMonthMicros, usd(month)).remainingMicros,
        },
      },
      ownKeys: { day: ownCap === null ? null : amountsOf(ownCap, usd(today.own)) },
    };
  }
}

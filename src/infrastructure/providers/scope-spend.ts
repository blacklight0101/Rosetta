import type { AccountUsage, CurrencyTotal } from '../../application/ports/account-usage.js';
import type { ScopeSpent } from '../../domain/budget/budget.js';
import { utcPeriodsOf } from '../../domain/budget/utc-periods.js';

// RF-429, P5-18, DEC-107: what the scope caps have spent when a run's providers are built, so the
// readers' share can be taken of the room the user's day and the server's month have left.

function usd(totals: readonly CurrencyTotal[]): bigint {
  return totals
    .filter((total) => total.currency === 'USD')
    .reduce((sum, total) => sum + total.costMicros, 0n);
}

/** The user's UTC day (server and own keys) and the server's UTC month, in USD micro-dollars. */
export async function scopeSpentAt(
  usage: Pick<AccountUsage, 'userDay' | 'serverMonth'>,
  userId: string,
  now: Date,
): Promise<ScopeSpent> {
  const periods = utcPeriodsOf(now);
  const [day, month] = await Promise.all([
    usage.userDay(userId, periods.dayStart),
    usage.serverMonth(periods.monthStart),
  ]);
  return { 'user-day': usd(day.server), 'own-day': usd(day.own), 'server-month': usd(month) };
}

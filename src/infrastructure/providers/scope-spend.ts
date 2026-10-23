import type { CostLedger } from '../../application/ports/cost-ledger.js';
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

/** P5-18: what the readers of this run spent before this start (a resume); 0 for a new run. */
export async function readerRunSpend(
  ledger: Pick<CostLedger, 'runEntries'>,
  userId: string,
  runId: string,
): Promise<bigint> {
  const entries = await ledger.runEntries(userId, runId);
  return entries
    .filter((entry) => entry.role === 'reader')
    .reduce((sum, entry) => sum + entry.costMicros, 0n);
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

/** What the scope caps and this run's readers have spent when its providers are built. */
export interface ScopeStart {
  readonly scopeSpent: ScopeSpent | undefined;
  readonly readerRunMicros: bigint;
}

/**
 * Both reads of run start, only when `wanted` (a run with a reader) and the factory has the usage
 * reads. A read that fails fails the build, so the run does not start (fail closed).
 */
export async function scopeStartOf(
  deps: {
    readonly usage?: Pick<AccountUsage, 'userDay' | 'serverMonth'>;
    readonly ledger: Pick<CostLedger, 'runEntries'>;
    readonly clock: { now(): Date };
  },
  request: {
    readonly account: { readonly id: string };
    readonly run: { readonly id: string | null };
  },
  wanted: boolean,
): Promise<ScopeStart> {
  const { usage } = deps;
  if (usage === undefined || !wanted) return { scopeSpent: undefined, readerRunMicros: 0n };
  const userId = request.account.id;
  const scopeSpent = await scopeSpentAt(usage, userId, deps.clock.now());
  const { id: runId } = request.run;
  const readerRunMicros = runId === null ? 0n : await readerRunSpend(deps.ledger, userId, runId);
  return { scopeSpent, readerRunMicros };
}

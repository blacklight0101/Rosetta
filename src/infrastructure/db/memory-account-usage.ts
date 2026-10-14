import type {
  AccountUsage,
  CurrencyTotal,
  UserSpend,
  UserUsage,
} from '../../application/ports/account-usage.js';
import type { EpochMs } from '../../domain/accounts/user.js';

// Architecture section 7, RF-1102: account usage in memory, for unit and route tests. A test adds
// projects and ledger rows; the adapter passes the same contract suite as PgAccountUsage.

export interface MemoryCostRow {
  readonly userId: string;
  readonly at: Date;
  readonly costMicros: bigint;
  readonly currency: string;
  /** Whose key paid; a row without one counts as the server's. */
  readonly keySource?: 'user' | 'server' | 'none';
}

function byCurrency(left: CurrencyTotal, right: CurrencyTotal): number {
  if (left.currency === right.currency) return 0;
  return left.currency < right.currency ? -1 : 1;
}

function totalled(rows: readonly MemoryCostRow[]): CurrencyTotal[] {
  const totals = new Map<string, bigint>();
  for (const row of rows)
    totals.set(row.currency, (totals.get(row.currency) ?? 0n) + row.costMicros);
  return [...totals].map(([currency, costMicros]) => ({ currency, costMicros })).sort(byCurrency);
}

export class MemoryAccountUsage implements AccountUsage {
  private readonly projects: string[] = [];
  private readonly costs: MemoryCostRow[] = [];

  addProject(userId: string): void {
    this.projects.push(userId);
  }

  addCost(row: MemoryCostRow): void {
    this.costs.push(row);
  }

  byUser(since: EpochMs): Promise<ReadonlyMap<string, UserUsage>> {
    const projects = new Map<string, number>();
    for (const userId of this.projects) projects.set(userId, (projects.get(userId) ?? 0) + 1);
    const spent = new Map<string, Map<string, bigint>>();
    for (const row of this.costs.filter((cost) => cost.at.getTime() >= since)) {
      const totals = spent.get(row.userId) ?? new Map<string, bigint>();
      totals.set(row.currency, (totals.get(row.currency) ?? 0n) + row.costMicros);
      spent.set(row.userId, totals);
    }
    const usage = new Map<string, UserUsage>();
    for (const userId of new Set([...projects.keys(), ...spent.keys()])) {
      const totals = [...(spent.get(userId) ?? new Map<string, bigint>())].map(
        ([currency, costMicros]) => ({ currency, costMicros }),
      );
      usage.set(userId, { projects: projects.get(userId) ?? 0, spent: totals.sort(byCurrency) });
    }
    return Promise.resolve(usage);
  }

  // RF-1106, DEC-107
  userDay(userId: string, since: EpochMs): Promise<UserSpend> {
    const own = this.costs.filter((row) => row.userId === userId && row.at.getTime() >= since);
    return Promise.resolve({
      server: totalled(own.filter((row) => (row.keySource ?? 'server') === 'server')),
      own: totalled(own.filter((row) => row.keySource === 'user')),
    });
  }

  // RF-1106
  serverMonth(since: EpochMs): Promise<readonly CurrencyTotal[]> {
    const totals = new Map<string, bigint>();
    for (const row of this.costs) {
      if (row.at.getTime() < since || (row.keySource ?? 'server') !== 'server') continue;
      totals.set(row.currency, (totals.get(row.currency) ?? 0n) + row.costMicros);
    }
    const sorted = [...totals].map(([currency, costMicros]) => ({ currency, costMicros }));
    return Promise.resolve(sorted.sort(byCurrency));
  }
}

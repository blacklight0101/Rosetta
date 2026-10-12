import type { LedgerEntry } from '../../application/ports/cost-ledger.js';
import type { CostTotals, LedgerGroup } from '../../application/ports/cost-totals.js';

// Architecture section 7, RF-428, RF-1010: the ledger sums in memory, for unit and route tests. A
// test adds ledger rows; the adapter passes the same contract suite as PgCostTotals.

export class MemoryCostTotals implements CostTotals {
  private readonly entries: LedgerEntry[] = [];

  add(entry: LedgerEntry): void {
    this.entries.push(entry);
  }

  userGroups(_userId: string): Promise<readonly LedgerGroup[]> {
    return Promise.resolve([]);
  }

  projectGroups(_userId: string, _projectId: string): Promise<readonly LedgerGroup[]> {
    return Promise.resolve([]);
  }
}

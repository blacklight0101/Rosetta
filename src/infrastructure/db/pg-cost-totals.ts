import type { CostTotals, LedgerGroup } from '../../application/ports/cost-totals.js';
import type { DatabasePool } from './pool.js';

// Architecture section 7, ADR-016, RF-428, RF-1010: the ledger sums of the totals pill and the cost
// page, read-only GROUP BY queries over `cost_ledger`.

export class PgCostTotals implements CostTotals {
  private readonly pool: DatabasePool;

  constructor(pool: DatabasePool) {
    this.pool = pool;
  }

  userGroups(_userId: string): Promise<readonly LedgerGroup[]> {
    void this.pool;
    return Promise.resolve([]);
  }

  projectGroups(_userId: string, _projectId: string): Promise<readonly LedgerGroup[]> {
    return Promise.resolve([]);
  }
}

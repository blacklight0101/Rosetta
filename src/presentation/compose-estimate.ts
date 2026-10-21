import type { ModelList } from '../application/models/model-list.js';
import type { ScanResults } from '../application/ports/scan-results.js';
import { EstimateRun } from '../application/estimate/estimate-run.js';
import type { PriceTable } from '../domain/budget/price-table.js';
import type { PgProjectRepository } from '../infrastructure/db/pg-project-repository.js';
import { PgProviderKeyRepository } from '../infrastructure/db/pg-provider-key-repository.js';
import type { PgRunIndex } from '../infrastructure/db/pg-run-index.js';
import type { DatabasePool } from '../infrastructure/db/pool.js';

// Architecture section 2 (composition root), RF-425, Q-57: the estimate before an understand run.
// It prices the roles with the shipped price table and states the limits of the shipped model list.

export interface EstimateParts {
  readonly pool: DatabasePool;
  readonly priceTable: PriceTable;
  readonly models: ModelList;
}

// RF-425
export function composeEstimateRun(
  parts: EstimateParts,
  stores: {
    readonly projects: PgProjectRepository;
    readonly runs: PgRunIndex;
    readonly scans: ScanResults;
  },
): EstimateRun {
  return new EstimateRun({
    ...stores,
    keys: new PgProviderKeyRepository(parts.pool),
    priceTable: parts.priceTable,
    models: parts.models,
  });
}

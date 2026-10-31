import type { ModelList, ReasoningModels } from '../application/models/model-list.js';
import type { ScanResults } from '../application/ports/scan-results.js';
import { EstimateRun } from '../application/estimate/estimate-run.js';
import type { Clock } from '../application/ports/clock.js';
import type { RoleKeyDependencies } from '../application/runs/role-keys.js';
import { PgAccountUsage } from '../infrastructure/db/pg-account-usage.js';
import { PgCostTotals } from '../infrastructure/db/pg-cost-totals.js';
import { PgServerSettings } from '../infrastructure/db/pg-server-settings.js';
import { PgUserRepository } from '../infrastructure/db/pg-user-repository.js';
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
  /** Q-58: the models the shipped list marks as reasoning models; the estimate names their effort. */
  readonly reasoningModels: ReasoningModels;
  readonly clock: Clock;
}

// RF-425
export function composeEstimateRun(
  parts: EstimateParts,
  stores: {
    readonly projects: PgProjectRepository;
    readonly runs: PgRunIndex;
    readonly scans: ScanResults;
    /** RF-431: whether each role has a usable key. */
    readonly roleKeys: RoleKeyDependencies;
  },
): EstimateRun {
  return new EstimateRun({
    ...stores,
    // RF-430: the measured totals of earlier runs (RF-428).
    history: new PgCostTotals(parts.pool),
    keys: new PgProviderKeyRepository(parts.pool),
    priceTable: parts.priceTable,
    models: parts.models,
    reasoningModels: parts.reasoningModels,
    // RF-405: the caps the first calls are checked against.
    caps: {
      users: new PgUserRepository(parts.pool),
      serverSettings: new PgServerSettings(parts.pool),
      usage: new PgAccountUsage(parts.pool),
      clock: parts.clock,
    },
  });
}

import type { KeySource } from '../../domain/budget/price-table.js';
import type { RunStage } from '../../domain/runs/run-states.js';

// Architecture section 7, RF-428, RF-1010, DEC-49, data-model.md section 3.13: read-only sums over
// `cost_ledger` for the totals pill of the header and the cost page of a project. The rows are
// grouped by every column a total or a breakdown line needs, so the application adds groups up and
// never reads one row per call. A provider test has neither project nor run (RF-407). Each group
// keeps the cost fixed at the time of its calls and the price table version they used.

/** The ledger rows that share every column below, summed. */
export interface LedgerGroup {
  /** Null for a provider test (RF-407): never joined to a run. */
  readonly runId: string | null;
  readonly stage: RunStage | 'provider-test';
  readonly role: string;
  readonly provider: string;
  readonly model: string;
  readonly keySource: KeySource;
  readonly currency: string;
  /** False for calls of an unpriced model (RF-427): their cost is unknown. */
  readonly costKnown: boolean;
  readonly priceTableVersion: string;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly costMicros: bigint;
  /** The instant of the group's first call. */
  readonly firstAt: Date;
}

export interface CostTotals {
  /** Every ledger row of the user, of every project and of none, grouped. */
  userGroups(userId: string): Promise<readonly LedgerGroup[]>;
  /** The user's ledger rows of one project, grouped. */
  projectGroups(userId: string, projectId: string): Promise<readonly LedgerGroup[]>;
}

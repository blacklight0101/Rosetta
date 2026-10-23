import type { KeySource } from '../../domain/budget/price-table.js';
import type { RunStage } from '../../domain/runs/run-states.js';

// Architecture section 7, RF-428, RF-1010, DEC-49, data-model.md section 3.13: read-only sums over
// `cost_ledger` for the totals pill of the header and the cost page of a project. The rows are
// grouped by every column a total or a breakdown line needs, so the application adds groups up and
// never reads one row per call. A provider test has neither project nor run (RF-407). Each group
// keeps the cost fixed at the time of its calls and the price table version they used.

/**
 * The ledger rows that share a currency, a known or unknown cost and a price table version, summed.
 * Its number is bounded by those three columns, not by the number of runs or calls, so the totals
 * pill reads a handful of rows however long the ledger is.
 */
export interface SummaryGroup {
  readonly currency: string;
  /** False for calls of an unpriced model (RF-427): their cost is unknown. */
  readonly costKnown: boolean;
  readonly priceTableVersion: string;
  /** True when every row of the group ran on a local model (key source `none`, P5-07). */
  readonly local: boolean;
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly costMicros: bigint;
}

/** A summary group of one project (RF-1008). */
export interface ProjectSummaryGroup extends SummaryGroup {
  readonly projectId: string;
}

/** The ledger rows that share every column below, summed. */
export interface LedgerGroup extends SummaryGroup {
  /** Null for a provider test (RF-407): never joined to a run. */
  readonly runId: string | null;
  readonly stage: RunStage | 'provider-test';
  readonly role: string;
  readonly provider: string;
  readonly model: string;
  readonly keySource: KeySource;
  /** The instant of the group's first call. */
  readonly firstAt: Date;
}

export interface CostTotals {
  /**
   * Every ledger row of the user, of every project and of none, summed per currency, known cost
   * and price table version only: what the totals pill needs, read in a bounded number of groups
   * (RF-1010).
   */
  userSummary(userId: string): Promise<readonly SummaryGroup[]>;
  /**
   * RF-1008: the user's ledger rows of the asked projects, summed per project, currency, known
   * cost and price table version, in one read however many projects are asked. A project with no
   * rows has no group; a provider test, of no project, is never in it.
   */
  projectSummaries(
    userId: string,
    projectIds: readonly string[],
  ): Promise<readonly ProjectSummaryGroup[]>;
  /** The user's ledger rows of one project, grouped. */
  projectGroups(userId: string, projectId: string): Promise<readonly LedgerGroup[]>;
  /** The user's provider tests (RF-407): the rows of no project, grouped. */
  providerTestGroups(userId: string): Promise<readonly LedgerGroup[]>;
}

import type { CurrencyTotal } from '../ports/account-usage.js';
import type { LedgerGroup } from '../ports/cost-totals.js';

// RF-428, RF-1010, DEC-49: adds ledger groups up into the totals the header shows and the breakdown
// of a project's cost page, by run, stage, role, provider and model.

export interface UsageTotals {
  readonly calls: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  /** The known cost per currency, ordered by currency. */
  readonly cost: readonly CurrencyTotal[];
  /** Calls of an unpriced model, whose cost is unknown (RF-427). */
  readonly unknownCostCalls: number;
  /** The price table versions the calls used, in code-unit order. */
  readonly priceTableVersions: readonly string[];
}

export interface BreakdownLine {
  readonly key: string;
  /** True when every call of the line ran on a local model (key source `none`). */
  readonly local: boolean;
  readonly totals: UsageTotals;
}

export interface RunLine extends BreakdownLine {
  /** Null for the provider tests, which belong to no run. */
  readonly runId: string | null;
  readonly firstAt: Date;
}

export interface ModelLine extends BreakdownLine {
  readonly provider: string;
  readonly model: string;
}

export interface CostBreakdown {
  readonly totals: UsageTotals;
  readonly byRun: readonly RunLine[];
  readonly byStage: readonly BreakdownLine[];
  readonly byRole: readonly BreakdownLine[];
  readonly byProvider: readonly BreakdownLine[];
  readonly byModel: readonly ModelLine[];
}

// RF-1010
export function totalsOf(_groups: readonly LedgerGroup[]): UsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cost: [],
    unknownCostCalls: 0,
    priceTableVersions: [],
  };
}

// RF-428
export function breakdownOf(groups: readonly LedgerGroup[]): CostBreakdown {
  return {
    totals: totalsOf(groups),
    byRun: [],
    byStage: [],
    byRole: [],
    byProvider: [],
    byModel: [],
  };
}

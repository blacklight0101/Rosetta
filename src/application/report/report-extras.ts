import type { SummaryGroup } from '../ports/cost-totals.js';
import type { ReportCost, ReportCoverage, ReportProjectTotals } from './report-model.js';

// RF-500, RF-1010: stub, the dashboard figures are written by the next commit.

/* eslint-disable @typescript-eslint/no-unused-vars -- stub until the next commit */
export function parseCoverage(_text: string | undefined): ReportCoverage | null {
  return null;
}

export function parseCostReport(_text: string | undefined): ReportCost | null {
  return null;
}

export function projectTotalsOf(_groups: readonly SummaryGroup[]): ReportProjectTotals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cachedInputTokens: 0,
    cost: [],
    unknownCostCalls: 0,
  };
}

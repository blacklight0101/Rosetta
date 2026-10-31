import type { LedgerGroup } from '../ports/cost-totals.js';
import type { ByScenario, EstimatePoint, JourneyEstimate } from './estimate-types.js';

// RF-430, DEC-196, ADR-026, EV-62: the likely and the worst-case total of the whole journey.

export interface MeasuredRun {
  readonly runId: string;
  readonly sourceTokens: number;
  readonly tokens: number;
  readonly costMicros: bigint;
}

export interface JourneyInputs {
  readonly understand: ByScenario<EstimatePoint>;
  readonly sourceTokens: number;
  readonly deepenRounds: number;
  readonly history: readonly MeasuredRun[];
}

export function journeyEstimateOf(inputs: JourneyInputs): JourneyEstimate {
  throw new Error(`Not built yet: ${String(inputs.deepenRounds)}`);
}

export function measuredRunsOf(
  groups: readonly LedgerGroup[],
  model: { readonly provider: string; readonly model: string },
  sourceTokens: number,
): readonly MeasuredRun[] {
  throw new Error(`Not built yet: ${String(groups.length + sourceTokens)} ${model.model}`);
}

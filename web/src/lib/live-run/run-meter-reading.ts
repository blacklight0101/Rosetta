import type { ApprovedView } from './approved-line.js';
import type { CapsState } from './run-state.js';

// RF-1003, P5-07: what the "This run" meter of the top bar reads from a run while it works. A run
// whose models are all local costs nothing, so its meter counts the tokens so far against the run
// token cap; a run with a priced model keeps its cost against the run cost cap.

export type MeterUnit = 'micros' | 'tokens';

export interface RunMeterReading {
  /** Micro-dollars or tokens, in the unit of the reading. */
  readonly spent: number;
  readonly cap: number;
  readonly unit: MeterUnit;
  /** P8-24: the words of the approved amount left, when the run is a step of a journey. */
  readonly approvedText?: string;
}

export interface RunMeterInput {
  readonly approved?: ApprovedView | undefined;
  readonly caps: CapsState | undefined;
  readonly costMicros: number;
  readonly tokens: number;
  readonly local: boolean;
}

// RF-1003, P5-07
export function runMeterReadingOf(input: RunMeterInput): RunMeterReading | undefined {
  const { caps, costMicros, tokens, local, approved } = input;
  // P8-24: a run of a journey is measured against the approved amount, which replaces its run cap.
  if (approved !== undefined) {
    const { spent, cap, unit } = approved;
    return cap > 0 ? { spent, cap, unit, approvedText: approved.text } : undefined;
  }
  if (caps === undefined) return undefined;
  if (local) {
    return caps.maxTokens > 0 ? { spent: tokens, cap: caps.maxTokens, unit: 'tokens' } : undefined;
  }
  return caps.maxCostMicros > 0
    ? { spent: costMicros, cap: caps.maxCostMicros, unit: 'micros' }
    : undefined;
}

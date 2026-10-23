import type { CapsState } from './run-state.js';

// RF-1003, P5-07: what the "This run" meter of the top bar reads from a run. Stub: the behaviour
// comes in the next commit.

export type MeterUnit = 'micros' | 'tokens';

export interface RunMeterReading {
  readonly spent: number;
  readonly cap: number;
  readonly unit: MeterUnit;
}

export interface RunMeterInput {
  readonly caps: CapsState;
  readonly costMicros: number;
  readonly tokens: number;
  readonly local: boolean;
}

// RF-1003
export function runMeterReadingOf(input: RunMeterInput): RunMeterReading | undefined {
  return input.caps.maxTokens < 0 ? undefined : undefined;
}

import type { RunPhase } from './run-phase.js';
import type { RunState } from './run-state.js';

export type StepName = 'Snapshot' | 'Scan' | 'Understand' | 'Verify' | 'Report';
export type StepStatus = 'done' | 'current' | 'waiting';

export interface Step {
  readonly name: StepName;
  readonly status: StepStatus;
  readonly detail: string | undefined;
}

export interface StepperRun {
  readonly stage: string;
  readonly commitSha: string | null;
}

// RF-1002 (stub for the red commit: the stepper is built by the next commit).
export function stepperOf(_run: StepperRun, _state: RunState, _phase: RunPhase): readonly Step[] {
  return [];
}

import type { RunPhase } from './run-phase.js';
import type { RunState } from './run-state.js';

// RF-1015 (P8-27): the title of a run page.

export interface RunTitleInput {
  readonly stage: string;
  readonly phase: RunPhase;
  readonly state: RunState;
}

// RF-1015
export function runTitleOf(input: RunTitleInput): string {
  if (input.stage === '') return '';
  return 'Live run';
}

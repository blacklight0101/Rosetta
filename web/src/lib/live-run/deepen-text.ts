import type { DeepenRoundState } from './run-state.js';

// RF-209: the line of one round of a Deepen run (stub, replaced by the fix).
export function roundText(round: DeepenRoundState, maxRounds: number): string {
  return `Round ${String(round.round)} of ${String(maxRounds)}`;
}

import type { DeepenRound } from '../../domain/deepen/deepen-record.js';
import type { RoundPlan } from '../../domain/deepen/round-plan.js';
import type { DeepenStopReason } from '../../domain/deepen/stop-rule.js';
import type { DeepenParts } from './deepen-parts.js';
import type { DeepenState } from './deepen-state.js';

// RF-209: one round of a Deepen (stub).

export interface RoundEnd {
  readonly state: DeepenState;
  readonly round: DeepenRound;
  readonly stopped?: DeepenStopReason;
}

// RF-209
export function runRound(
  parts: DeepenParts,
  state: DeepenState,
  input: { readonly plan: RoundPlan; readonly round: number },
): Promise<RoundEnd> {
  const round: DeepenRound = {
    round: input.round,
    complete: true,
    judged: [],
    reread: [],
    filesRead: [],
    newClaims: [],
    tokens: 0,
    costMicros: 0,
  };
  return Promise.resolve({ state, round });
}

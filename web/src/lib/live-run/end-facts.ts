import type { RunState } from './run-state.js';
import { overviewOf, roleTotalsOf } from './run-summary.js';

// RF-1015, DEC-137: the figures of the "Your turn" panel of an ended run, taken from the run's
// state: Supported claims of those judged, cards written, areas
// read and the tokens spent. Each figure has this one source (P8-27).

export interface EndFacts {
  readonly cards: number;
  readonly claims: number;
  /** Claims the judgement step found `Supported`: what `plan` can use (RF-614). */
  readonly supportedClaims: number;
  /** P8-27: the claims the judgement step gave a verdict, Supported or Rejected. */
  readonly judgedClaims: number;
  /** Agents that finished with their cards, of all the agents the run planned. */
  readonly areasRead: number;
  readonly areas: number;
  readonly tokens: number;
}

// RF-1015
export function endFactsOf(state: RunState): EndFacts {
  return {
    cards: state.cards.length,
    claims: state.claims.length,
    supportedClaims: state.claims.filter((claim) => claim.status === 'Supported').length,
    judgedClaims: state.claims.filter(
      (claim) => claim.status === 'Supported' || claim.status === 'Rejected',
    ).length,
    areasRead: overviewOf(state).done,
    areas: state.agents.length,
    tokens: roleTotalsOf(state).reduce(
      (sum, role) => sum + role.inputTokens + role.outputTokens,
      0,
    ),
  };
}

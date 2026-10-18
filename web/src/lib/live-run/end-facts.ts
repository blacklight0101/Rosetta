import type { RunState } from './run-state.js';
import { overviewOf, roleTotalsOf } from './run-summary.js';

// RF-1015, DEC-137: the figures of the "Your turn" panel of an ended run, taken from the run's
// state: cards written, citations that passed their check, areas read and the tokens spent.

export interface EndFacts {
  readonly cards: number;
  /** Claims whose citations were checked and held, of all the claims. */
  readonly citationsPassed: number;
  readonly claims: number;
  /** Claims the judgement step found `Supported`: what `plan` can use (RF-614). */
  readonly supportedClaims: number;
  /** Agents that finished with their cards, of all the agents the run planned. */
  readonly areasRead: number;
  readonly areas: number;
  readonly tokens: number;
}

const notPassed: ReadonlySet<string> = new Set(['Proposed', 'CitationInvalid']);

// RF-1015
export function endFactsOf(state: RunState): EndFacts {
  return {
    cards: state.cards.length,
    citationsPassed: state.claims.filter((claim) => !notPassed.has(claim.status)).length,
    claims: state.claims.length,
    supportedClaims: state.claims.filter((claim) => claim.status === 'Supported').length,
    areasRead: overviewOf(state).done,
    areas: state.agents.length,
    tokens: roleTotalsOf(state).reduce(
      (sum, role) => sum + role.inputTokens + role.outputTokens,
      0,
    ),
  };
}

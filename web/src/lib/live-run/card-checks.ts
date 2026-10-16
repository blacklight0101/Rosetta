import type { ClaimRow, RunState } from './run-state.js';

// RF-1004, RF-1014, RF-1015: each card of the run with where its citations stand: all checked, at
// least one invalid, or still waiting for the check. The model step of the verifier is not built, so
// a card is never called supported here.

export interface CardView {
  readonly cardId: string;
  readonly type: string;
  readonly title: string;
  readonly check: 'checked' | 'invalid' | 'waiting';
}

function checkOf(claims: readonly ClaimRow[]): CardView['check'] {
  if (claims.some((claim) => claim.status === 'CitationInvalid' || claim.status === 'Rejected')) {
    return 'invalid';
  }
  if (claims.length === 0 || claims.some((claim) => claim.status === 'Proposed')) return 'waiting';
  return 'checked';
}

// RF-1014
export function cardViewsOf(state: RunState): readonly CardView[] {
  return state.cards.map((card) => ({
    ...card,
    check: checkOf(state.claims.filter((claim) => claim.cardId === card.cardId)),
  }));
}

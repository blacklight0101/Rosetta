import type { Card, Claim } from '../cards/card.js';

// RF-264: the cards the overview may be written from are the cards whose citations passed. A claim
// passed when its citation check did not fail and the judgement did not reject it, so `Proposed`
// (checked, not judged yet), `Supported` and `Unverified` pass; `CitationInvalid` and `Rejected` do
// not. Open questions are not facts about the application, so they are left out.

function claimPassed(claim: Claim): boolean {
  return claim.status !== 'CitationInvalid' && claim.status !== 'Rejected';
}

/** The cards with at least one claim that passed, each holding only those claims. */
// RF-264
export function eligibleCards(cards: readonly Card[]): readonly Card[] {
  return cards
    .filter((card) => card.type !== 'OQ')
    .map((card) => ({ ...card, claims: card.claims.filter(claimPassed) }))
    .filter((card) => card.claims.length > 0);
}

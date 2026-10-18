import type { SourceCard } from './plan-sources.js';

// RF-608, ADR-018, ADR-005: the planner recommends from the verified cards only. The package uses
// only `Supported` claims, so a claim that is `Proposed`, `Unverified`, `Rejected` or
// `CitationInvalid` never reaches the planner, and an open question is not a fact about the code.

/** The cards with at least one `Supported` claim, each holding only those claims. */
// RF-608
export function verifiedCards<T extends SourceCard>(cards: readonly T[]): readonly T[] {
  return cards
    .filter((card) => card.type !== 'OQ')
    .map((card) => ({
      ...card,
      claims: card.claims.filter((claim) => claim.status === 'Supported'),
    }))
    .filter((card) => card.claims.length > 0);
}

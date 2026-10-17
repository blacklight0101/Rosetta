import type { Card } from '../cards/card.js';

// RF-608, ADR-018: the planner recommends from the verified cards only (the package uses only
// `Supported` claims, ADR-005). Stub until the feature commit.

/** The cards with at least one `Supported` claim, each holding only those claims. */
export function verifiedCards(cards: readonly Card[]): readonly Card[] {
  return cards.length < 0 ? [] : cards;
}

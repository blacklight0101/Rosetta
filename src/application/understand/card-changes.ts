import type { Card } from '../../domain/cards/card.js';
import type { PriorCard } from '../ports/prior-cards.js';

// RF-241: the cards of a re-run that are new or changed, against the earlier cards of the same
// area. An earlier card is the one with the same area, type and title; it is changed when its
// claims, as texts, are not the claims of the new card.

export interface CardRef {
  readonly id: string;
  readonly title: string;
}

export interface CardChanges {
  readonly added: readonly CardRef[];
  readonly changed: readonly CardRef[];
}

const keyOf = (card: { area: string; type: string; title: string }): string =>
  JSON.stringify([card.area, card.type, card.title]);

const claimsKey = (claims: readonly string[]): string => JSON.stringify([...claims].sort());

// RF-241
export function compareCards(cards: readonly Card[], prior: readonly PriorCard[]): CardChanges {
  const earlier = new Map(prior.map((card) => [keyOf(card), claimsKey(card.claims)]));
  const added: CardRef[] = [];
  const changed: CardRef[] = [];
  for (const card of cards) {
    const before = earlier.get(keyOf(card));
    const ref = { id: card.id, title: card.title };
    if (before === undefined) added.push(ref);
    else if (before !== claimsKey(card.claims.map((claim) => claim.text))) changed.push(ref);
  }
  return { added, changed };
}

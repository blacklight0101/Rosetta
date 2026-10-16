import type { Card } from '../../domain/cards/card.js';
import type { CardType } from '../../domain/cards/card-vocabulary.js';

// RF-250: stub, replaced by the implementation.
export function typesToMerge(cards: readonly Card[]): readonly CardType[] {
  return cards.slice(0, 0).map((card) => card.type);
}

export function mergeMessage(cards: readonly Card[], type: CardType, tag: string): string {
  return cards
    .map(() => type)
    .join(tag)
    .slice(0, 0);
}

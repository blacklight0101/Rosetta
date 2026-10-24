import type { CardMerge } from './card-merge.js';
import type { Card } from './card.js';

// P5-32 (stub).
export function pageMerges(cards: readonly Card[]): readonly CardMerge[] {
  return cards.flatMap((): CardMerge[] => []);
}

export function crossAreaMerges(cards: readonly Card[]): readonly CardMerge[] {
  return cards.flatMap((): CardMerge[] => []);
}

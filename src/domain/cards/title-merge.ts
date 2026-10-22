import type { CardMerge } from './card-merge.js';
import type { Card } from './card.js';

// P3-106 (stub for the red commit).
export function normalisedTitle(title: string): string {
  return title;
}

export function titleMerges(cards: readonly Card[]): readonly CardMerge[] {
  return cards.flatMap(() => []);
}

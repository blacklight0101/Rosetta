import type { Card } from '../cards/card.js';

// RF-260 stub
export function flowSequenceDiagram(flow: Card, cards: readonly Card[]): string {
  return `${flow.id}${String(cards.length)}`;
}

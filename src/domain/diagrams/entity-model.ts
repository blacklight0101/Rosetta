import type { Card } from '../cards/card.js';
import type { EntityModel } from './entity-diagram.js';

// RF-262: stub.
export function entityModelOf(cards: readonly Card[]): EntityModel {
  const none = cards.slice(0, 0);
  return {
    entities: none.map((c) => ({ cardId: c.id, name: c.title, fields: [] })),
    relations: [],
  };
}

import type { Card } from '../cards/card.js';
import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { EntityModel } from './entity-diagram.js';

// RF-262, DEC-134: the entity model of the data model, built from the ENT cards. A card holds
// claims, not structured fields or relations, so the model has the entities only: one per ENT
// card, in card id order, named by the card's title. Nothing is drawn that the cards do not state,
// and no cardinality is guessed; the relations a later card records are added here.

export function entityModelOf(cards: readonly Card[]): EntityModel {
  const byId = new Map<string, EntityModel['entities'][number]>();
  for (const card of cards) {
    if (card.type !== 'ENT' || byId.has(card.id)) continue;
    byId.set(card.id, { cardId: card.id, name: card.title, fields: [] });
  }
  const entities = [...byId.values()].toSorted((left, right) =>
    byCodeUnit(left.cardId, right.cardId),
  );
  return { entities, relations: [] };
}

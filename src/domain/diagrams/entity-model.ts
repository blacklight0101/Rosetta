import type { Card, Claim } from '../cards/card.js';
import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { EntityModel } from './entity-diagram.js';

// RF-262, DEC-134: the entity model of the data model, built from the ENT cards. A card holds
// claims, not structured fields, so the model has one entity per ENT card, in card id order, named
// by the card's title. A relation is drawn only where a Supported claim of an ENT card names
// another entity (its title, as a whole word); its cardinality is unknown, never guessed, so the
// data model lists it to confirm. A claim that is Rejected, unverified or not yet judged states
// nothing. Each pair of entities has one relation, from the first claim that states it.

type Entity = EntityModel['entities'][number];
type Relation = EntityModel['relations'][number];

const patternCharacters = /[.*+?^${}()|[\]\\]/gu;

/** The name as a whole word or words, with an optional plural `s`, case ignored. */
function mentionOf(name: string): RegExp {
  const escaped = name.trim().replace(patternCharacters, String.raw`\$&`);
  return new RegExp(String.raw`(?<![\p{L}\p{N}_])${escaped}s?(?![\p{L}\p{N}_])`, 'iu');
}

interface Mention {
  readonly entity: Entity;
  readonly mention: RegExp;
}

function relation(from: Entity, to: Entity, claim: Claim): Relation {
  return {
    from: from.cardId,
    to: to.cardId,
    label: `stated by ${claim.claimId}`,
    fromCardinality: 'unknown',
    toCardinality: 'unknown',
  };
}

/** The relations one entity's Supported claims state, one per other entity named. */
function relationsOfCard(entity: Entity, card: Card, mentions: readonly Mention[]): Relation[] {
  const found = new Map<string, Relation>();
  const supported = card.claims.filter((claim) => claim.status === 'Supported');
  for (const claim of supported) {
    for (const { entity: other, mention } of mentions) {
      if (other.cardId === entity.cardId || found.has(other.cardId)) continue;
      if (mention.test(claim.text)) found.set(other.cardId, relation(entity, other, claim));
    }
  }
  return [...found.values()];
}

function relationsOf(cards: ReadonlyMap<string, Card>, entities: readonly Entity[]): Relation[] {
  const mentions = entities
    .filter((entity) => entity.name.trim() !== '')
    .map((entity) => ({ entity, mention: mentionOf(entity.name) }));
  return entities.flatMap((entity) => {
    const card = cards.get(entity.cardId);
    return card === undefined ? [] : relationsOfCard(entity, card, mentions);
  });
}

export function entityModelOf(cards: readonly Card[]): EntityModel {
  const byId = new Map<string, Card>();
  for (const card of cards) if (card.type === 'ENT' && !byId.has(card.id)) byId.set(card.id, card);
  const entities = [...byId.values()]
    .map((card): Entity => ({ cardId: card.id, name: card.title, fields: [] }))
    .toSorted((left, right) => byCodeUnit(left.cardId, right.cardId));
  return { entities, relations: relationsOf(byId, entities) };
}

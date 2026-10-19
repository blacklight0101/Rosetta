import { describe, expect, it } from 'vitest';
import type { Claim } from '../../../../src/domain/cards/card.js';
import { entityModelOf } from '../../../../src/domain/diagrams/entity-model.js';
import { cardOf } from '../../../support/diagram-fixtures.js';

// RF-262: the entity model comes from the ENT cards. The cards hold claims, not structured
// relations, so a relation is drawn only where a Supported claim names another entity, and its
// cardinality is unknown: nothing is guessed.

const claim = (claimId: string, text: string, status: Claim['status']): Claim => ({
  claimId,
  text,
  citations: [{ path: 'src/Orders/Checkout.cs', startLine: 10, endLine: 24 }],
  status,
});

const catalogItem = cardOf({ id: 'ENT-001', type: 'ENT', title: 'Catalog item' });

const basketLine = (...claims: Claim[]): ReturnType<typeof cardOf> =>
  cardOf({ id: 'ENT-002', type: 'ENT', title: 'Basket line', claims });

describe('entityModelOf', () => {
  it('RF-262 makes one entity per ENT card, in card id order, named by its title', () => {
    const model = entityModelOf([
      cardOf({ id: 'ENT-002', type: 'ENT', title: 'Order' }),
      cardOf({ id: 'BR-001', type: 'BR', title: 'A rule' }),
      cardOf({ id: 'ENT-001', type: 'ENT', title: 'Customer' }),
    ]);

    expect(model.entities).toEqual([
      { cardId: 'ENT-001', name: 'Customer', fields: [] },
      { cardId: 'ENT-002', name: 'Order', fields: [] },
    ]);
  });
});

describe('entityModelOf relations', () => {
  it('RF-262 a card with no claim naming another entity has no relation', () => {
    const model = entityModelOf([
      cardOf({ id: 'ENT-001', type: 'ENT', title: 'Customer' }),
      cardOf({ id: 'ENT-002', type: 'ENT', title: 'Order' }),
    ]);

    expect(model.relations).toEqual([]);
  });

  it('RF-262 a Supported claim that names another entity states a relation of unknown cardinality', () => {
    const model = entityModelOf([
      catalogItem,
      basketLine(claim('ENT-002.c2', 'A basket line refers to a catalog item.', 'Supported')),
    ]);

    expect(model.relations).toEqual([
      {
        from: 'ENT-002',
        to: 'ENT-001',
        label: 'stated by ENT-002.c2',
        fromCardinality: 'unknown',
        toCardinality: 'unknown',
      },
    ]);
  });

  it('RF-262 a claim that is not Supported states no relation', () => {
    for (const status of ['Proposed', 'CitationInvalid', 'Rejected', 'Unverified'] as const) {
      const model = entityModelOf([
        catalogItem,
        basketLine(claim('ENT-002.c1', 'A basket line refers to a catalog item.', status)),
      ]);

      expect(model.relations).toEqual([]);
    }
  });
});

describe('entityModelOf mentions', () => {
  it('RF-262 a name in a claim of another type of card states no relation', () => {
    const model = entityModelOf([
      catalogItem,
      cardOf({
        id: 'BR-001',
        type: 'BR',
        title: 'A rule',
        claims: [claim('BR-001.c1', 'A catalog item costs money.', 'Supported')],
      }),
    ]);

    expect(model.relations).toEqual([]);
  });

  it('RF-262 an entity named in its own claim, or in two claims, gives no self relation and one relation', () => {
    const model = entityModelOf([
      catalogItem,
      basketLine(
        claim('ENT-002.c1', 'A basket line holds a quantity.', 'Supported'),
        claim('ENT-002.c2', 'A basket line refers to a catalog item.', 'Supported'),
        claim('ENT-002.c3', 'Many catalog items fill a basket line.', 'Supported'),
      ),
    ]);

    expect(model.relations.map((r) => [r.from, r.to, r.label])).toEqual([
      ['ENT-002', 'ENT-001', 'stated by ENT-002.c2'],
    ]);
  });
});

describe('entityModelOf names', () => {
  it('RF-262 a name inside a longer word is not a mention', () => {
    const model = entityModelOf([
      cardOf({ id: 'ENT-001', type: 'ENT', title: 'Order' }),
      cardOf({
        id: 'ENT-002',
        type: 'ENT',
        title: 'Shipment',
        claims: [claim('ENT-002.c1', 'A shipment records the border country.', 'Supported')],
      }),
    ]);

    expect(model.relations).toEqual([]);
  });

  it('RF-262 a title with pattern characters is matched as plain text', () => {
    const model = entityModelOf([
      cardOf({ id: 'ENT-001', type: 'ENT', title: 'Item (old)' }),
      cardOf({
        id: 'ENT-002',
        type: 'ENT',
        title: 'Line',
        claims: [claim('ENT-002.c1', 'A line refers to an item (old).', 'Supported')],
      }),
    ]);

    expect(model.relations.map((r) => r.to)).toEqual(['ENT-001']);
  });
});

describe('entityModelOf entities', () => {
  it('RF-262 an id given twice makes one entity, the first one', () => {
    const first = cardOf({ id: 'ENT-001', type: 'ENT', title: 'Customer' });
    const second = cardOf({ id: 'ENT-001', type: 'ENT', title: 'Other' });

    expect(entityModelOf([first, second]).entities).toEqual([
      { cardId: 'ENT-001', name: 'Customer', fields: [] },
    ]);
  });

  it('RF-262 a run without ENT cards has an empty model', () => {
    expect(entityModelOf([cardOf({ id: 'FEAT-001', type: 'FEAT', title: 'x' })])).toEqual({
      entities: [],
      relations: [],
    });
  });
});

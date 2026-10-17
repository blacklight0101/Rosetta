import { describe, expect, it } from 'vitest';
import { entityModelOf } from '../../../../src/domain/diagrams/entity-model.js';
import { cardOf } from '../../../support/diagram-fixtures.js';

// RF-262: the entity model comes from the ENT cards. The cards hold no structured fields or
// relations, so the model has entities only: nothing is drawn that the cards do not state.

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

  it('RF-262 invents no relation, so no cardinality is guessed', () => {
    const model = entityModelOf([
      cardOf({ id: 'ENT-001', type: 'ENT', title: 'Customer' }),
      cardOf({ id: 'ENT-002', type: 'ENT', title: 'Order' }),
    ]);

    expect(model.relations).toEqual([]);
  });

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

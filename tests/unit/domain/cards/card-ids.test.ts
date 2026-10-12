import { describe, expect, it } from 'vitest';
import { assignCardIds, formatCardId } from '../../../../src/domain/cards/card-ids.js';
import { draftOf, twoAreas } from '../../../support/card-fixtures.js';

describe('assignCardIds', () => {
  it('RF-203 numbers each type from 001 in order of area and appearance', () => {
    const cards = assignCardIds(twoAreas());

    expect(cards.ok && cards.value.map((card) => [card.id, card.area, card.agentTaskId])).toEqual([
      ['FEAT-001', 'orders', 'task-orders'],
      ['BR-001', 'orders', 'task-orders'],
      ['FEAT-002', 'orders', 'task-orders'],
      ['OQ-001', 'orders', 'task-orders'],
      ['ENT-001', 'catalog', 'task-catalog'],
      ['FEAT-003', 'catalog', 'task-catalog'],
      ['BR-002', 'catalog', 'task-catalog'],
    ]);
  });

  it('RF-203 ids are unique within the run', () => {
    const cards = assignCardIds(twoAreas());

    const ids = cards.ok ? cards.value.map((card) => card.id) : [];
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('RF-203 the same input always gives the same ids', () => {
    expect(assignCardIds(twoAreas())).toEqual(assignCardIds(twoAreas()));
  });

  it('RF-203 the area of the task, not the agent text, is the card area', () => {
    const tasks = [{ agentTaskId: 't', area: 'billing', drafts: [draftOf({ area: 'whatever' })] }];

    const cards = assignCardIds(tasks);

    expect(cards.ok && cards.value[0]?.area).toBe('billing');
  });

  it('RF-203 pads to three digits and grows past 999', () => {
    expect(formatCardId('BR', 7)).toBe('BR-007');
    expect(formatCardId('FEAT', 1000)).toBe('FEAT-1000');
  });
});

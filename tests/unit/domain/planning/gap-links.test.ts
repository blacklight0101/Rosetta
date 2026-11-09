import { describe, expect, it } from 'vitest';
import { linkGapItems } from '../../../../src/domain/planning/gap-links.js';
import type { CoverageItem } from '../../../../src/domain/planning/plan-coverage.js';
import { planOf } from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// P8-95, RF-627, RF-623, EV-95: an item of the gap block that a card of the plan already does is
// linked to that card by the gap answer; the card then builds it. A link that names no card the
// plan had before the round, the card that writes the migrations, or no item of the block is
// dropped with its position and field, and the items it named stay gaps.

const flow = (key: string, name: string): CoverageItem => ({
  ...{ id: `flow:${key}`, kind: 'flow', name, detail: '' },
});

const open = [
  flow('FLOW-002', 'Create a catalog item'),
  flow('FLOW-009', 'Create a catalog item'),
  flow('FLOW-010', 'Edit a catalog item'),
];

const migrations = planTask({
  ...{ id: 'T-001', title: 'Write the database migrations in the chosen stack' },
  builds: ['table:catalog'],
});
const crud = planTask({
  ...{ id: 'T-004', title: 'Create, edit and delete catalog items for signed-in users' },
  builds: ['feature:F-003', 'flow:FLOW-006'],
});
const content = planOf([migrations, crud]);
const before = ['T-001', 'T-004'];
const unknown = 'names no task card of the plan';

describe('linkGapItems', () => {
  it('RF-627 P8-95 the linked card builds the items of the block the link names, after its own', () => {
    const links = [{ position: 1, task: 'T-004', builds: ['flow:FLOW-010', 'flow:FLOW-002'] }];

    const result = linkGapItems(content, links, open, before);

    const card = result.content.tasks.find((task) => task.id === 'T-004');
    expect(card?.builds).toEqual([
      'feature:F-003',
      'flow:FLOW-006',
      'flow:FLOW-002',
      'flow:FLOW-010',
    ]);
    expect(result.linked).toEqual([{ task: 'T-004', builds: ['flow:FLOW-002', 'flow:FLOW-010'] }]);
    expect(result.dropped).toEqual([]);
  });

  it('RF-627 P8-95 an id that is no item of the block builds nothing, and the others of the link stay', () => {
    const links = [{ position: 1, task: 'T-004', builds: ['flow:FLOW-009', 'flow:FLOW-006', 'x'] }];

    const card = linkGapItems(content, links, open, before).content.tasks[1];

    expect(card?.builds).toEqual(['feature:F-003', 'flow:FLOW-006', 'flow:FLOW-009']);
  });

  it('RF-627 no link leaves the plan as it was', () => {
    expect(linkGapItems(content, [], open, before)).toEqual({ content, linked: [], dropped: [] });
  });
});

describe('linkGapItems: links that are dropped', () => {
  it('RF-627 P8-95 a link to a card the plan did not have before the round is dropped', () => {
    const grown = planOf([migrations, crud, planTask({ id: 'T-005', title: 'New' })]);
    const links = [
      { position: 1, task: 'T-005', builds: ['flow:FLOW-002'] },
      { position: 2, task: 'T-099', builds: ['flow:FLOW-009'] },
    ];

    const result = linkGapItems(grown, links, open, before);

    expect(result.content).toBe(grown);
    expect(result.dropped).toEqual([
      { ...{ position: 1, field: 'task' }, reason: unknown, builds: ['flow:FLOW-002'] },
      { ...{ position: 2, field: 'task' }, reason: unknown, builds: ['flow:FLOW-009'] },
    ]);
  });

  it('RF-623 P8-95 a link to the card that writes the migrations is dropped', () => {
    const links = [{ position: 1, task: 'T-001', builds: ['flow:FLOW-002'] }];

    const result = linkGapItems(content, links, open, before);

    expect(result.content).toBe(content);
    expect(result.dropped).toEqual([
      {
        ...{ position: 1, field: 'task', builds: ['flow:FLOW-002'] },
        reason: 'names the card that writes the database migrations',
      },
    ]);
  });

  it('RF-627 P8-95 a link that names no item of the block is dropped', () => {
    const links = [{ position: 1, task: 'T-004', builds: ['flow:FLOW-006'] }];

    const result = linkGapItems(content, links, open, before);

    expect(result.content).toBe(content);
    expect(result.dropped).toEqual([
      {
        ...{ position: 1, field: 'builds', builds: ['flow:FLOW-006'] },
        reason: 'names no item that is still built by no task card',
      },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import type { PlanDraft } from '../../../../src/domain/planning/plan-draft.js';
import { draftTask } from '../../../support/task-card-fixtures.js';

// RF-627, RF-602: a requirement position of a task card that the list of requirements does not
// have is dropped from the card and noted, with the card and the size of the list, for checks.md.

const supported = new Set(['FEAT-001', 'BR-001']);

function draft(tasks: PlanDraft['tasks']): PlanDraft {
  return {
    summary: 'A new shop.',
    requirements: [
      { title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] },
      { title: 'Export', statement: 'Export a day.', sources: ['FEAT-002'] },
      { title: 'Shipping', statement: 'Ship free over 50.', sources: ['BR-001'] },
    ],
    components: [],
    decisions: [],
    entities: [],
    phases: [{ name: 'First', goal: 'Orders.', exitCriteria: ['Orders run.'] }],
    tasks,
    risks: [],
    technical: { integrations: [], security: [], targets: [], environments: [] },
  };
}

describe('assemblePlan: requirement positions outside the list', () => {
  it('RF-627 a position the list does not have is a note with the card and the size of the list', () => {
    const { content } = assemblePlan(draft([draftTask({ requirements: [1, 2, 9] })]), supported);

    expect(content.requirementNotes).toEqual([
      { kind: 'position', card: 1, position: 9, count: 3 },
    ]);
  });

  it('RF-627 a position is noted once per card, and position 0 is outside the list', () => {
    const task = draftTask({ requirements: [1, 0, 4, 4, 5] });

    const { content } = assemblePlan(draft([task]), supported);

    expect(content.requirementNotes).toEqual([
      { kind: 'position', card: 1, position: 0, count: 3 },
      { kind: 'position', card: 1, position: 4, count: 3 },
      { kind: 'position', card: 1, position: 5, count: 3 },
    ]);
  });

  it('RF-627 the card is the draft position, whichever cards before it are left out', () => {
    const left = draftTask({ title: 'Left out', phase: 2 });
    const tasks = [left, draftTask({ requirements: [7] })];

    const { content } = assemblePlan(draft(tasks), supported);

    expect(content.requirementNotes).toEqual([
      { kind: 'position', card: 2, position: 7, count: 3 },
    ]);
  });

  it('RF-627 a position of a requirement that was dropped for want of a source is not outside the list', () => {
    const { content } = assemblePlan(draft([draftTask({ requirements: [1, 2, 3] })]), supported);

    expect(content.requirementNotes).toBeUndefined();
  });
});

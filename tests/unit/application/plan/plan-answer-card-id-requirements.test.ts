import { describe, expect, it } from 'vitest';
import { parsePlanAnswer } from '../../../../src/application/plan/plan-answer.js';
import { scenario } from '../../../support/task-card-fixtures.js';

// P7-15, EV-67, RF-601, RF-627, DEC-176: a list of requirements or dependsOn is read entry by entry.
// A source card id ("FEAT-114") is mapped to the requirement positions that cite it, a string of
// digits is its position, and any other entry is dropped and counted; the task card is kept.

const requirements = [
  { title: 'Orders', statement: 'Place an order.', sources: ['FEAT-001'] },
  { title: 'Mail', statement: 'Send mail.', sources: ['FEAT-114', 'FEAT-106'] },
  { title: 'Rates', statement: 'Rate items.', sources: ['FEAT-114'] },
];
const task = { title: 'Orders', phase: 1, requirements: [1], acceptanceCriteria: [scenario] };

function draftWith(extra: object) {
  const answer = { requirements, tasks: [{ ...task, ...extra }] };
  return parsePlanAnswer(JSON.stringify(answer));
}

describe('parsePlanAnswer: a card id written as a requirement (P7-15)', () => {
  it('RF-601 P7-15 a source card id maps to every requirement position that cites it', () => {
    const draft = draftWith({ requirements: [1, 'FEAT-114'] });

    expect(draft?.unreadableTasks).toBeUndefined();
    expect(draft?.tasks[0]?.requirements).toEqual([1, 2, 3]);
  });

  it('RF-601 P7-15 a digit string is its position and a repeated position is kept once', () => {
    const draft = draftWith({ requirements: ['2', 'FEAT-106', 2] });

    expect(draft?.tasks[0]?.requirements).toEqual([2]);
  });

  it('RF-601 P7-15 an entry that is no position and no cited card is dropped, the card stays', () => {
    const draft = draftWith({ requirements: [1, 'abc', 'FEAT-999', 0, 201, { id: 'x' }, null] });

    expect(draft?.unreadableTasks).toBeUndefined();
    expect(draft?.tasks).toHaveLength(1);
    expect(draft?.tasks[0]?.requirements).toEqual([1]);
    expect(draft?.unreadableItems).toEqual([
      expect.objectContaining({ list: 'tasks', position: 1, field: 'requirements' }),
    ]);
    expect(draft?.unreadableItems?.[0]?.reason).toContain('6 entries');
  });

  it('RF-601 P7-15 a mapped card id is listed with its count and no word of the answer', () => {
    const draft = draftWith({ requirements: ['FEAT-114', 'FEAT-106'] });

    const items = draft?.unreadableItems ?? [];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ list: 'tasks', position: 1, field: 'requirements' });
    expect(items[0]?.reason).toContain('2 entries');
    expect(items[0]?.reason).toContain('mapped');
    expect(JSON.stringify(items)).not.toContain('FEAT-1');
  });
});

describe('parsePlanAnswer: a bad entry of dependsOn or a list that is no list (P7-15)', () => {
  it('RF-601 P7-15 a bad dependsOn entry drops only the entry', () => {
    const draft = draftWith({ dependsOn: ['abc', '1', 1.5] });

    expect(draft?.unreadableTasks).toBeUndefined();
    expect(draft?.tasks[0]?.dependsOn).toEqual([1]);
    expect(draft?.unreadableItems).toEqual([
      expect.objectContaining({ list: 'tasks', position: 1, field: 'dependsOn' }),
    ]);
  });

  it('RF-601 P7-15 a card whose requirements all drop is kept with an empty list', () => {
    const draft = draftWith({ requirements: ['nothing here'] });

    expect(draft?.tasks).toHaveLength(1);
    expect(draft?.tasks[0]?.requirements).toEqual([]);
  });

  it('RF-601 P7-15 a card whose requirements field is not a list stays unreadable', () => {
    const draft = draftWith({ requirements: 'FEAT-114' });

    expect(draft?.unreadableTasks).toEqual([
      expect.objectContaining({ position: 1, field: 'requirements' }),
    ]);
  });
});

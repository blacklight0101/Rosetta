import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePlanAnswer } from '../../../../src/application/plan/plan-answer.js';

// EV-30, Q-54, RF-601: a position written as a string of digits is read as that number; any other
// string stays refused, and the Left out reason says that a position was not a number.

import { scenario } from '../../../support/task-card-fixtures.js';

const requirement = { title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] };
const task = { title: 'Orders', phase: 1, requirements: [1], acceptanceCriteria: [scenario] };

/** An answer with one requirement and one task card, the card's fields overridden by `extra`. */
function answerWith(extra: object): string {
  return JSON.stringify({ requirements: [requirement], tasks: [{ ...task, ...extra }] });
}

function tasksOf(extra: object): unknown {
  return parsePlanAnswer(answerWith(extra))?.tasks;
}

function unreadableOf(extra: object): unknown {
  return parsePlanAnswer(answerWith(extra))?.unreadableTasks;
}

describe('parsePlanAnswer: positions written as digit strings (EV-30)', () => {
  it('RF-601 EV-30 a string of digits reads as its position in requirements and dependsOn', () => {
    const extra = { requirements: ['1', '12'], dependsOn: ['2'] };

    expect(tasksOf(extra)).toMatchObject([{ requirements: [1, 12], dependsOn: [2] }]);
  });

  it.each(['abc', '1.5', ' 3', '0', '201'])(
    'RF-601 P7-15 the position %j is not a number and is dropped, the card kept',
    (bad) => {
      expect(unreadableOf({ requirements: [bad] })).toBeUndefined();
      expect(tasksOf({ requirements: [bad] })).toMatchObject([{ requirements: [] }]);
    },
  );

  it('RF-601 P7-15 the Left out row says how many entries of dependsOn were dropped', () => {
    const items = parsePlanAnswer(answerWith({ dependsOn: ['abc'] }))?.unreadableItems;
    expect(items).toEqual([expect.objectContaining({ position: 1, field: 'dependsOn' })]);
    expect(items?.[0]?.reason).toContain('1 entry');
  });

  it('RF-601 EV-30 the recorded eShop answer with digit-string positions keeps its six cards', async () => {
    const text = await readFile(
      join('tests', 'fixtures', 'plan-answers', 'eshop-string-positions.json'),
      'utf8',
    );
    const draft = parsePlanAnswer(text);

    expect(draft?.unreadableTasks).toBeUndefined();
    expect(draft?.tasks).toHaveLength(6);
    expect(draft?.tasks[0]?.requirements).toEqual([1, 12, 13, 14, 23, 35, 80]);
    expect(draft?.tasks[1]?.dependsOn).toEqual([1]);
  });
});

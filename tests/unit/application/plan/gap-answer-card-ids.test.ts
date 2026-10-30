import { describe, expect, it } from 'vitest';
import { parseGapAnswer } from '../../../../src/application/plan/gap-answer.js';
import {
  entryWarnings,
  gapLeftOutItems,
} from '../../../../src/application/plan/gap-round-notes.js';
import { addGapTasks } from '../../../../src/domain/planning/plan-gap.js';
import type { CoverageItem } from '../../../../src/domain/planning/plan-coverage.js';
import { planOf, twoTasks } from '../../../support/coverage-fixtures.js';
import { draftTask } from '../../../support/task-card-fixtures.js';

// P7-15, EV-67, RF-627, RF-607: a gap card is read entry by entry too. A source card id in
// `requirements` is mapped to the requirements that cite it, a digit string is its position, any
// other entry is dropped and counted, and the card is kept. Under SDD an empty list is then filled
// by P7-14's derivation.

const menu: CoverageItem = { id: 'feature:F-007', kind: 'feature', name: 'Menu', detail: '' };
const itemSources = new Map<string, ReadonlySet<string>>([
  ['feature:F-007', new Set(['FEAT-009'])],
]);
const sdd = { specificationDriven: true, itemSources };

function answerWith(requirements: unknown[]): string {
  const card = { ...draftTask(), needs: undefined, requirements, builds: ['feature:F-007'] };
  return JSON.stringify({ tasks: [card] });
}

describe('parseGapAnswer: a card id written as a requirement (P7-15)', () => {
  it('RF-627 P7-15 the card is kept and the entries that map or drop are counted by field', () => {
    const answer = parseGapAnswer(answerWith(['FEAT-009', '1', 'abc', {}]));

    expect(answer?.problems).toEqual([]);
    expect(answer?.drafts).toHaveLength(1);
    expect(answer?.drafts[0]?.requirementCards).toEqual(['FEAT-009']);
    expect(answer?.entries).toEqual([{ position: 1, field: 'requirements', count: 2 }]);
  });

  it('RF-627 P7-15 the mapped card id gives the requirements that cite it', () => {
    const answer = parseGapAnswer(answerWith(['FEAT-009']));

    const result = addGapTasks(planOf(twoTasks()), answer?.drafts ?? [], [menu], sdd);

    expect(result.leftOut).toEqual([]);
    expect(result.content.tasks[2]?.requirements).toEqual(['REQ-002']);
    expect(result.content.requirementNotes).toEqual([
      { kind: 'cited', task: 'T-003', mapped: 1, dropped: 0 },
    ]);
  });

  it('RF-607 P7-15 under SDD a list that drops to nothing is filled from what the card builds', () => {
    const answer = parseGapAnswer(answerWith(['nothing', 'FEAT-999']));

    const result = addGapTasks(planOf(twoTasks()), answer?.drafts ?? [], [menu], sdd);

    expect(result.leftOut).toEqual([]);
    expect(result.content.tasks[2]?.requirements).toEqual(['REQ-002']);
    expect(result.content.requirementNotes).toEqual([
      { kind: 'cited', task: 'T-003', mapped: 0, dropped: 1 },
      { kind: 'added', task: 'T-003', requirement: 'REQ-002' },
    ]);
  });

  it('RF-627 P7-15 checks.md and the log list the dropped entries with no answer text', () => {
    const answer = parseGapAnswer(answerWith(['FEAT-009', 'abc']));
    if (answer === undefined) throw new Error('the answer must read');

    const rows = gapLeftOutItems('Gap answer', answer.problems, answer.entries);
    const warnings = entryWarnings('gap answer', false, answer.entries);

    expect(rows.map((row) => [row.item, row.field])).toEqual([['1', 'requirements']]);
    expect(rows[0]?.reason).toMatch(/dropped; the card was kept/u);
    expect(warnings.join(' ')).toContain('"requirements"');
    expect(JSON.stringify([rows, warnings])).not.toMatch(/FEAT-009|abc/u);
  });
});

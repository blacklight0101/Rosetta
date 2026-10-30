import { describe, expect, it } from 'vitest';
import type { CoverageItem } from '../../../../src/domain/planning/plan-coverage.js';
import { addGapTasks, type GapDraft } from '../../../../src/domain/planning/plan-gap.js';
import { planOf, twoTasks } from '../../../support/coverage-fixtures.js';
import { draftTask } from '../../../support/task-card-fixtures.js';

// P7-15 round 2, RF-627: a gap card writes source card ids or requirement ids in `requirements`.
// The plan resolves them: an id some requirement cites (or a requirement id the plan has) maps; an
// id no requirement cites is reported as dropped, never as mapped. REQ-001 cites ENT-001 and
// REQ-002 cites FEAT-009 (planOf); the plan has no REQ-004.

const menu: CoverageItem = { id: 'feature:F-007', kind: 'feature', name: 'Menu', detail: '' };

function gapDraft(requirementCards: string[]): GapDraft {
  return { ...draftTask(), requirements: [], builds: ['feature:F-007'], requirementCards };
}

function notesOf(cards: string[]) {
  return addGapTasks(planOf(twoTasks()), [gapDraft(cards)], [menu], {}).content;
}

describe('addGapTasks: ids written as requirements of a gap card (P7-15)', () => {
  it('RF-627 P7-15 a source card id that a requirement cites is mapped', () => {
    const content = notesOf(['FEAT-009']);

    expect(content.tasks[2]?.requirements).toEqual(['REQ-002']);
    expect(content.requirementNotes).toEqual([
      expect.objectContaining({ kind: 'cited', task: 'T-003', mapped: 1, dropped: 0 }),
    ]);
  });

  it('RF-627 P7-15 an id no requirement cites is dropped, not mapped', () => {
    const content = notesOf(['FEAT-999']);

    expect(content.tasks[2]?.requirements).toEqual([]);
    expect(content.requirementNotes).toEqual([
      expect.objectContaining({ kind: 'cited', task: 'T-003', mapped: 0, dropped: 1 }),
    ]);
  });

  it('RF-627 P7-15 REQ-002 is a requirement of the plan and maps; REQ-004 is not and drops', () => {
    const content = notesOf(['REQ-002', 'REQ-004']);

    expect(content.tasks[2]?.requirements).toEqual(['REQ-002']);
    expect(content.requirementNotes).toEqual([
      expect.objectContaining({ kind: 'cited', task: 'T-003', mapped: 1, dropped: 1 }),
    ]);
  });
});

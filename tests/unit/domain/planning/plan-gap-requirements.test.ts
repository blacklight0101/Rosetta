import { describe, expect, it } from 'vitest';
import type { CoverageItem } from '../../../../src/domain/planning/plan-coverage.js';
import { addGapTasks, type GapDraft } from '../../../../src/domain/planning/plan-gap.js';
import { planOf, twoTasks } from '../../../support/coverage-fixtures.js';
import { draftTask } from '../../../support/task-card-fixtures.js';

// P7-14, RF-607, RF-627: under SDD a gap card with no requirement is not dropped at once. Its
// requirements are taken from what it builds (the requirements that cite a source card behind its
// items); when no requirement cites one, the card is kept and checks.md notes the item as one that
// needs a requirement (Haiku Invoice plan 8ff8e480, F-007 from FEAT-011). Only a card whose items
// have no source card at all, so nothing to derive, is still left out.

const feature: CoverageItem = { id: 'feature:F-001', kind: 'feature', name: 'Orders', detail: '' };
const menu: CoverageItem = { id: 'feature:F-007', kind: 'feature', name: 'Menu', detail: '' };
const bare: CoverageItem = { id: 'flow:FLOW-009', kind: 'flow', name: 'Bare', detail: '' };
const gaps = [feature, menu, bare];

// REQ-001 cites ENT-001 and REQ-002 cites FEAT-009 (planOf); no requirement cites FEAT-011.
const itemSources = new Map<string, ReadonlySet<string>>([
  ['feature:F-001', new Set(['ENT-001'])],
  ['feature:F-007', new Set(['FEAT-011'])],
]);

function gapDraft(builds: string[], overrides: Partial<GapDraft> = {}): GapDraft {
  return { ...draftTask(), requirements: [], builds, ...overrides };
}

const sdd = { specificationDriven: true, itemSources };

describe('addGapTasks: the requirements of a gap card under SDD (P7-14)', () => {
  it('RF-607 P7-14 derives a requirement for a card that builds a source-backed item', () => {
    const result = addGapTasks(planOf(twoTasks()), [gapDraft(['feature:F-001'])], gaps, sdd);

    expect(result.leftOut).toEqual([]);
    const added = result.content.tasks[2];
    expect(added?.requirements).toEqual(['REQ-001']);
    expect(result.content.requirementNotes).toEqual([
      { kind: 'added', task: 'T-003', requirement: 'REQ-001' },
    ]);
  });

  it('RF-607 P7-14 keeps a card whose item no requirement covers and notes the item', () => {
    const result = addGapTasks(planOf(twoTasks()), [gapDraft(['feature:F-007'])], gaps, sdd);

    expect(result.leftOut).toEqual([]);
    expect(result.content.tasks[2]?.builds).toEqual(['feature:F-007']);
    expect(result.content.tasks[2]?.requirements).toEqual([]);
    expect(result.content.requirementNotes).toEqual([
      { kind: 'unbacked', task: 'T-003', item: 'feature:F-007' },
    ]);
  });

  it('RF-607 P7-14 leaves out only a card that has nothing to derive', () => {
    const drafts = [gapDraft(['flow:FLOW-009']), gapDraft(['feature:F-007'])];

    const result = addGapTasks(planOf(twoTasks()), drafts, gaps, sdd);

    expect(result.leftOut.map((each) => [each.position, each.field])).toEqual([
      [1, 'requirements'],
    ]);
    expect(result.content.tasks.map((task) => task.id)).toEqual(['T-001', 'T-002', 'T-003']);
  });
});

describe('addGapTasks: a gap card that needs no derived requirement (P7-14)', () => {
  it('RF-607 P7-14 a card that names a requirement keeps it and gets no note', () => {
    const drafts = [gapDraft(['feature:F-007'], { requirements: [2] })];

    const result = addGapTasks(planOf(twoTasks()), drafts, gaps, sdd);

    expect(result.content.tasks[2]?.requirements).toEqual(['REQ-002']);
    expect(result.content.requirementNotes).toBeUndefined();
  });

  it('RF-627 P7-14 without SDD a card with no requirement is kept with no note', () => {
    const drafts = [gapDraft(['feature:F-007'])];

    const result = addGapTasks(planOf(twoTasks()), drafts, gaps, { itemSources });

    expect(result.content.tasks[2]?.requirements).toEqual([]);
    expect(result.content.requirementNotes).toBeUndefined();
  });
});

import { describe, expect, it } from 'vitest';
import type { CoverageItem } from '../../../../src/domain/planning/plan-coverage.js';
import { addGapTasks, type GapDraft } from '../../../../src/domain/planning/plan-gap.js';
import { planOf, twoTasks } from '../../../support/coverage-fixtures.js';
import { draftTask } from '../../../support/task-card-fixtures.js';

// Q-54, RF-627, RF-630, ADR-013: a task card of the gap answer that the plan does not take is
// returned with its position in the answer, the field that kept it out and a fixed phrase for the
// reason, and the ids it named, so the run can log it and the repair can be asked. It holds no
// text of the card.

const flow: CoverageItem = { id: 'flow:FLOW-007', kind: 'flow', name: 'Refund', detail: '' };
const screen: CoverageItem = { id: 'screen:SCRN-004', kind: 'screen', name: 'Refunds', detail: '' };
const gaps = [flow, screen];

function gapDraft(overrides: Partial<GapDraft> = {}): GapDraft {
  return { ...draftTask(), builds: ['flow:FLOW-007'], ...overrides };
}

function leftOutOf(drafts: GapDraft[], options = {}) {
  return addGapTasks(planOf(twoTasks(), 2), drafts, gaps, options).leftOut;
}

describe('addGapTasks: the cards it leaves out', () => {
  it.each([
    ['a phase outside the plan', { phase: 9 }, 'phase'],
    ['no risk class', { riskClass: undefined }, 'riskClass'],
    ['no invariant', { invariant: '' }, 'invariant'],
    [
      'a Done-when item in prose',
      { acceptanceCriteria: ['The order is stored.'] },
      'acceptanceCriteria',
    ],
    ['a guard with no probes', { adds: ['parser'] as const }, 'probes'],
    ['a build that names no open gap', { builds: ['feature:F-001', 'flow:ghost'] }, 'builds'],
  ] as const)('Q-54 %s is returned with its field', (_name, overrides, field) => {
    const left = leftOutOf([gapDraft(), gapDraft({ ...overrides })]);

    expect(left.map((each) => [each.position, each.field])).toEqual([[2, field]]);
    expect(left[0]?.reason).toMatch(/\S/u);
    expect(left[0]?.builds).toEqual(gapDraft({ ...overrides }).builds);
  });

  it('Q-54 RF-607 given SDD a card that implements no requirement is returned', () => {
    const left = leftOutOf([gapDraft({ requirements: [] })], { specificationDriven: true });

    expect(left.map((each) => [each.position, each.field])).toEqual([[1, 'requirements']]);
  });

  it('Q-54 without SDD the same card is kept and nothing is left out', () => {
    expect(leftOutOf([gapDraft({ requirements: [] })])).toEqual([]);
  });

  it('Q-54 the positions are those of the answer, not of the cards that could be read', () => {
    const left = leftOutOf([gapDraft(), gapDraft({ phase: 9 })], { positions: [2, 5] });

    expect(left.map((each) => each.position)).toEqual([5]);
  });

  it('Q-54 RF-634 a card waits for the card of the answer position it names', () => {
    const drafts = [gapDraft({ title: 'One' }), gapDraft({ title: 'Two', dependsOn: [2] })];

    const { content } = addGapTasks(planOf(twoTasks(), 2), drafts, gaps, { positions: [2, 4] });

    expect(content.tasks.find((task) => task.title === 'Two')?.dependsOn).toContain('T-003');
  });

  it('Q-54 ADR-013 the reason is a phrase of the program, never text of the card', () => {
    const left = leftOutOf([gapDraft({ title: 'sentinel-title', invariant: '' })]);

    expect(JSON.stringify(left)).not.toContain('sentinel-title');
  });
});

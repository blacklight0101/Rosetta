import { describe, expect, it } from 'vitest';
import { parsePlanAnswer } from '../../../src/application/plan/plan-answer.js';
import { leftOutItems } from '../../../src/application/plan/plan-package.js';
import { assemblePlan } from '../../../src/domain/planning/plan-content.js';
import { invariant, scenario } from '../../support/task-card-fixtures.js';

// P7-15, EV-67, RF-601, RF-607, DEC-176: shaped like the eShop plan a9700a80, where six package
// cards held a source card id ("FEAT-114", "BR-009") in a requirement position and checks.md left
// them all out. Now every card is kept with the requirements that cite its card, and checks.md lists
// what was mapped, by position and field, with no word of the answer.

const sources = ['FEAT-114', 'FEAT-106', 'BR-009', 'FEAT-122', 'SCRN-022', 'FEAT-124'];
const requirements = [
  { title: 'Catalog', statement: 'Browse the catalog.', sources: ['FEAT-122', 'SCRN-022'] },
  { title: 'Basket', statement: 'Keep a basket.', sources: ['FEAT-124'] },
  { title: 'Orders', statement: 'Place an order.', sources: ['FEAT-114'] },
  { title: 'Mail', statement: 'Send mail.', sources: ['FEAT-106'] },
  { title: 'Rules', statement: 'Apply rules.', sources: ['BR-009'] },
];
const card = (title: string, ids: unknown[]) => ({
  ...{ title, phase: 1, requirements: ids, acceptanceCriteria: [scenario] },
  ...{ invariant, riskClass: 'none' },
});
const tasks = [
  card('Catalog screens', [1, 2, 11, 'FEAT-114']),
  card('Basket', ['FEAT-124']),
  card('Orders', ['FEAT-114']),
  card('Mail', ['FEAT-106']),
  card('Rules', ['BR-009']),
  card('Catalog api', ['FEAT-122', 'SCRN-022']),
  card('Shipping', ['FEAT-114']),
];
const answer = {
  ...{ requirements, tasks },
  phases: [{ name: 'One', goal: 'Build it.', exitCriteria: ['Done.'] }],
};

describe('plan answer shaped like the eShop plan a9700a80 (P7-15)', () => {
  it('RF-601 P7-15 all seven cards are kept, each with the requirements that cite its card', () => {
    const draft = parsePlanAnswer(JSON.stringify(answer));
    expect(draft).toBeDefined();
    if (draft === undefined) return;

    const plan = assemblePlan(draft, new Set(sources), { specificationDriven: true });

    expect(plan.content.tasks).toHaveLength(7);
    expect(plan.leftOut).toEqual([]);
    expect(plan.content.tasks.map((each) => each.requirements)).toEqual([
      ['REQ-001', 'REQ-002', 'REQ-003'],
      ['REQ-002'],
      ['REQ-003'],
      ['REQ-004'],
      ['REQ-005'],
      ['REQ-001'],
      ['REQ-003'],
    ]);
  });

  it('RF-601 P7-15 checks.md lists the mapped entries by position and field, never answer text', () => {
    const draft = parsePlanAnswer(JSON.stringify(answer));
    if (draft === undefined) throw new Error('the answer must read');
    const plan = assemblePlan(draft, new Set(sources), { specificationDriven: true });

    const rows = leftOutItems({
      leftOut: plan.leftOut,
      unreadable: plan.unreadable,
      dataModelProblems: [],
    });

    expect(rows).toHaveLength(7);
    expect(rows[0]).toMatchObject({ area: 'Plan answer', item: 'tasks, position 1' });
    expect(rows.every((row) => row.field === 'requirements')).toBe(true);
    expect(JSON.stringify(rows)).not.toMatch(/FEAT|BR-009|SCRN/u);
  });
});

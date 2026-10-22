import { describe, expect, it } from 'vitest';
import type { PlanContent, PlanTask } from '../../../../src/domain/planning/plan-content.js';
import { alignRequirements } from '../../../../src/domain/planning/requirement-alignment.js';
import { coverageDocuments, planOf } from '../../../support/coverage-fixtures.js';
import { planTask } from '../../../support/task-card-fixtures.js';

// RF-627, RF-630, RF-631: a task card that builds an item lists the requirements whose source cards
// are behind that item, and none whose source cards share nothing with what the card builds. The
// documents are those of the coverage fixture: features F-001 (FEAT-001) and F-002 (FEAT-002),
// screens SCRN-001 and SCRN-003.

const requirements: PlanContent['requirements'] = [
  { id: 'REQ-001', title: 'Place', statement: 'Place an order.', sources: ['FEAT-001'] },
  { id: 'REQ-002', title: 'Invoice', statement: 'Show the invoice.', sources: ['SCRN-001'] },
  { id: 'REQ-003', title: 'Checkout', statement: 'Show the checkout.', sources: ['SCRN-003'] },
  { id: 'REQ-004', title: 'List', statement: 'List customers.', sources: ['FEAT-002'] },
];

function aligned(tasks: readonly PlanTask[], plan: Partial<PlanContent> = {}): PlanContent {
  return alignRequirements({ ...planOf(tasks), requirements, ...plan }, coverageDocuments());
}

describe('alignRequirements: the recorded case', () => {
  const tasks = [
    planTask({ id: 'T-001', requirements: ['REQ-003'], builds: ['screen:SCRN-001'] }),
    planTask({ id: 'T-002', requirements: ['REQ-004'], builds: ['screen:SCRN-003'] }),
    planTask({ id: 'T-003', requirements: [], builds: ['feature:F-001', 'feature:F-002'] }),
  ];

  it('RF-627 a card gets the requirements behind the item it builds and loses the others', () => {
    const content = aligned(tasks);

    expect(content.tasks.map((task) => task.requirements)).toEqual([
      ['REQ-002'],
      ['REQ-003'],
      ['REQ-001', 'REQ-004'],
    ]);
  });

  it('RF-627 each change is a note, in the order of the cards', () => {
    const content = aligned(tasks);

    expect(content.requirementNotes).toEqual([
      { kind: 'added', task: 'T-001', requirement: 'REQ-002' },
      { kind: 'removed', task: 'T-001', requirement: 'REQ-003' },
      { kind: 'added', task: 'T-002', requirement: 'REQ-003' },
      { kind: 'removed', task: 'T-002', requirement: 'REQ-004' },
      { kind: 'added', task: 'T-003', requirement: 'REQ-001' },
      { kind: 'added', task: 'T-003', requirement: 'REQ-004' },
    ]);
  });

  it('RF-627 the requirements stay in the order of the plan, and the notes of the plan stay', () => {
    const position = { kind: 'position', card: 9, position: 14, count: 13 } as const;
    const task = planTask({
      requirements: ['REQ-004'],
      builds: ['feature:F-001', 'feature:F-002'],
    });

    const content = aligned([task], { requirementNotes: [position] });

    expect(content.tasks[0]?.requirements).toEqual(['REQ-001', 'REQ-004']);
    expect(content.requirementNotes?.[0]).toEqual(position);
  });
});

describe('alignRequirements: what stays as it is', () => {
  it('RF-627 a card that builds nothing keeps its requirements, with no note', () => {
    const content = aligned([planTask({ requirements: ['REQ-004'], builds: [] })]);

    expect(content.tasks[0]?.requirements).toEqual(['REQ-004']);
    expect(content.requirementNotes).toBeUndefined();
  });

  it('RF-627 a card whose requirement and builds agree is unchanged, with no note', () => {
    const task = planTask({ requirements: ['REQ-002'], builds: ['screen:SCRN-001'] });

    const content = aligned([task]);

    expect(content.tasks).toEqual([task]);
    expect(content.requirementNotes).toBeUndefined();
  });

  it('RF-627 an item with no source card gives no ground to change a card', () => {
    const documents = coverageDocuments();
    const [first, ...rest] = documents.prd.features;
    if (first === undefined) throw new Error('The fixture has features');
    const features = [{ ...first, sources: [] }, ...rest];
    const bare = { ...documents, prd: { ...documents.prd, features } };
    const task = planTask({ requirements: ['REQ-004'], builds: ['feature:F-001'] });

    const content = alignRequirements({ ...planOf([task]), requirements }, bare);

    expect(content.tasks[0]?.requirements).toEqual(['REQ-004']);
  });

  it('RF-627 a requirement stays when taking it off would leave the card with none, and a note says so', () => {
    const only = requirements.filter((each) => each.id !== 'REQ-001');
    const task = planTask({ requirements: ['REQ-004'], builds: ['feature:F-001'] });
    const other = planTask({ id: 'T-002', requirements: [], builds: ['feature:F-002'] });

    const content = aligned([task, other], { requirements: only });

    expect(content.tasks[0]?.requirements).toEqual(['REQ-004']);
    expect(content.requirementNotes?.filter((each) => each.task === 'T-001')).toEqual([
      { kind: 'unmatched', task: 'T-001', requirement: 'REQ-004', kept: 1 },
    ]);
  });
});

// A rule or a question card is no item, so a requirement citing only such cards belongs to no
// other card and is never taken off.
describe('alignRequirements: a requirement no item is built on', () => {
  const withRule: PlanContent['requirements'] = [
    ...requirements,
    { id: 'REQ-005', title: 'Rule', statement: 'Ship free.', sources: ['BR-001', 'OQ-001'] },
  ];

  it('RF-627 RF-631 a requirement whose source cards are behind no item stays on the card', () => {
    const task = planTask({ requirements: ['REQ-001', 'REQ-005'], builds: ['feature:F-001'] });

    const content = aligned([task], { requirements: withRule });

    expect(content.tasks[0]?.requirements).toEqual(['REQ-001', 'REQ-005']);
    expect(content.requirementNotes).toBeUndefined();
  });

  it('RF-627 it stays when the card gains others, and the others are still corrected', () => {
    const task = planTask({ requirements: ['REQ-004', 'REQ-005'], builds: ['feature:F-001'] });
    const other = planTask({ id: 'T-002', requirements: [], builds: ['feature:F-002'] });

    const content = aligned([task, other], { requirements: withRule });

    expect(content.tasks[0]?.requirements).toEqual(['REQ-001', 'REQ-005']);
    expect(content.requirementNotes?.filter((each) => each.task === 'T-001')).toEqual([
      { kind: 'added', task: 'T-001', requirement: 'REQ-001' },
      { kind: 'removed', task: 'T-001', requirement: 'REQ-004' },
    ]);
  });

  it('RF-627 a card whose requirements are all of this kind is left alone, with no note', () => {
    const task = planTask({ requirements: ['REQ-005'], builds: ['feature:F-001'] });
    const only = withRule.filter((each) => each.id !== 'REQ-001');

    const content = aligned([task], { requirements: only });

    expect(content.tasks[0]?.requirements).toEqual(['REQ-005']);
    expect(content.requirementNotes).toBeUndefined();
  });
});

describe('alignRequirements: a requirement is taken off only where another card builds it', () => {
  it('RF-627 a requirement behind an item no card builds stays where the planner put it', () => {
    const task = planTask({ requirements: ['REQ-001', 'REQ-004'], builds: ['feature:F-001'] });

    const content = aligned([task]);

    expect(content.tasks[0]?.requirements).toEqual(['REQ-001', 'REQ-004']);
    expect(content.requirementNotes).toBeUndefined();
  });

  it('RF-627 it is taken off once another card builds the item behind it', () => {
    const task = planTask({ requirements: ['REQ-001', 'REQ-004'], builds: ['feature:F-001'] });
    const other = planTask({ id: 'T-002', requirements: [], builds: ['feature:F-002'] });

    const content = aligned([task, other]);

    expect(content.tasks.map((each) => each.requirements)).toEqual([['REQ-001'], ['REQ-004']]);
  });

  it('RF-627 RF-631 a requirement of mixed sources, a rule and an item nobody builds, stays', () => {
    const mixed: PlanContent['requirements'] = [
      ...requirements,
      { id: 'REQ-005', title: 'Mixed', statement: 'Both.', sources: ['FEAT-002', 'BR-001'] },
    ];
    const task = planTask({ requirements: ['REQ-005'], builds: ['feature:F-001'] });
    const other = planTask({ id: 'T-002', requirements: [], builds: ['screen:SCRN-001'] });

    const content = aligned([task, other], { requirements: mixed });

    expect(content.tasks[0]?.requirements).toEqual(['REQ-001', 'REQ-005']);
    expect(content.tasks.flatMap((each) => each.requirements)).toContain('REQ-005');
  });

  it('RF-627 when all that the card lists would go, each one kept says how many it keeps', () => {
    const task = planTask({ requirements: ['REQ-003', 'REQ-004'], builds: ['screen:SCRN-001'] });
    const builds = ['screen:SCRN-003', 'feature:F-002'];
    const others = planTask({ id: 'T-002', requirements: [], builds });
    const none = requirements.filter((each) => each.id !== 'REQ-002');

    const content = aligned([task, others], { requirements: none });

    expect(content.tasks[0]?.requirements).toEqual(['REQ-003', 'REQ-004']);
    expect(content.requirementNotes?.filter((each) => each.task === 'T-001')).toEqual([
      { kind: 'unmatched', task: 'T-001', requirement: 'REQ-003', kept: 2 },
      { kind: 'unmatched', task: 'T-001', requirement: 'REQ-004', kept: 2 },
    ]);
  });
});

import { describe, expect, it } from 'vitest';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import type { PlanDraft } from '../../../../src/domain/planning/plan-draft.js';

// RF-601, RF-602, ADR-005: the planner's draft is checked against the supported cards before it
// becomes the content of the package.

const supported = new Set(['FEAT-001', 'BR-001', 'ENT-001']);

function draft(): PlanDraft {
  return {
    summary: 'A new shop.',
    requirements: [
      { title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] },
      { title: 'Export', statement: 'Export a day.', sources: ['FEAT-002'] },
      { title: 'Shipping', statement: 'Ship free over 50.', sources: ['BR-001', 'X-1', 'BR-001'] },
    ],
    components: [
      { name: 'Web', responsibility: 'Pages.', dependsOn: ['Service', 'Web', 'Mainframe'] },
      { name: 'Service', responsibility: 'Rules.', dependsOn: [] },
    ],
    decisions: [
      { title: 'One service', context: 'C.', decision: 'D.', consequences: '', sources: ['X-1'] },
    ],
    entities: [
      { legacy: 'Order', target: 'Order', notes: '', sources: ['ENT-001'] },
      { legacy: 'Export', target: 'Export', notes: '', sources: ['FEAT-002'] },
    ],
    phases: [{ name: 'First', goal: 'Orders.', exitCriteria: ['Orders run.'] }],
    tasks: [
      { title: 'Orders', phase: 1, requirements: [1, 2, 3, 3, 9], acceptanceCriteria: ['Given.'] },
      { title: 'Later', phase: 2, requirements: [1], acceptanceCriteria: ['Given.'] },
    ],
    risks: [{ text: 'Two thresholds.', sources: ['BR-001', 'FEAT-002'] }],
  };
}

describe('assemblePlan', () => {
  it('RF-602 keeps a requirement only with a supported source card, and only those cards', () => {
    const { content, dropped } = assemblePlan(draft(), supported);

    expect(content.requirements).toEqual([
      { id: 'REQ-001', title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] },
      { id: 'REQ-002', title: 'Shipping', statement: 'Ship free over 50.', sources: ['BR-001'] },
    ]);
    expect(dropped.requirements).toBe(1);
  });

  it('RF-602 a task names the kept requirements by their new ids', () => {
    const { content } = assemblePlan(draft(), supported);

    expect(content.tasks).toEqual([
      {
        id: 'T-001',
        title: 'Orders',
        phase: 1,
        requirements: ['REQ-001', 'REQ-002'],
        acceptanceCriteria: ['Given.'],
      },
    ]);
  });

  it('RF-601 leaves out a task in a phase the roadmap does not have', () => {
    expect(assemblePlan(draft(), supported).dropped.tasks).toBe(1);
  });
});

describe('assemblePlan: the other parts', () => {
  it('RF-602 keeps an entity mapping only with a supported source card', () => {
    const { content, dropped } = assemblePlan(draft(), supported);

    expect(content.entities.map((entity) => entity.legacy)).toEqual(['Order']);
    expect(dropped.entities).toBe(1);
  });

  it('RF-602 decisions and risks keep only supported source cards, and may have none', () => {
    const { content } = assemblePlan(draft(), supported);

    expect(content.decisions).toMatchObject([{ id: 'ADR-001', sources: [] }]);
    expect(content.risks).toMatchObject([{ id: 'RISK-001', sources: ['BR-001'] }]);
  });

  it('RF-601 a component depends only on other components the plan names', () => {
    const { content } = assemblePlan(draft(), supported);

    expect(content.components[0]?.dependsOn).toEqual(['Service']);
  });

  it('RF-601 numbers the phases from 1', () => {
    expect(assemblePlan(draft(), supported).content.phases).toMatchObject([{ number: 1 }]);
  });
});

describe('assemblePlan: specification-driven', () => {
  const specified = { specificationDriven: true };

  it('RF-607 leaves out a task that implements no requirement, and numbers the others again', () => {
    const base = draft();
    const withBare = {
      ...base,
      tasks: [
        { title: 'Bare', phase: 1, requirements: [], acceptanceCriteria: ['Given.'] },
        { title: 'Unknown', phase: 1, requirements: [9], acceptanceCriteria: ['Given.'] },
        { title: 'Orders', phase: 1, requirements: [1], acceptanceCriteria: ['Given.'] },
      ],
    };

    const { content, dropped } = assemblePlan(withBare, supported, specified);

    expect(content.tasks).toMatchObject([
      { id: 'T-001', title: 'Orders', requirements: ['REQ-001'] },
    ]);
    expect(dropped.tasks).toBe(2);
  });

  it('RF-607 without SDD the same task is written with no requirement', () => {
    const base = draft();
    const bare = { title: 'Bare', phase: 1, requirements: [], acceptanceCriteria: ['Given.'] };

    const { content } = assemblePlan({ ...base, tasks: [bare] }, supported);

    expect(content.tasks).toMatchObject([{ title: 'Bare', requirements: [] }]);
  });

  it('RF-608 a planner decision is proposed and lists no options', () => {
    expect(assemblePlan(draft(), supported).content.decisions).toMatchObject([
      { status: 'Proposed', options: [] },
    ]);
  });
});

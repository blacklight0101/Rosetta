import { describe, expect, it } from 'vitest';
import type { LeftOutCard } from '../../../../src/domain/planning/left-out-card.js';
import { assemblePlan } from '../../../../src/domain/planning/plan-content.js';
import type { PlanDraft } from '../../../../src/domain/planning/plan-draft.js';
import { draftTask } from '../../../support/task-card-fixtures.js';

// RF-627, RF-630, ADR-013, Q-54: a task card of the planner's answer that the package leaves out is
// named by its position and the field that kept it out, never by text of the answer.

const supported = new Set(['FEAT-001']);

function draft(): PlanDraft {
  return {
    summary: '',
    requirements: [{ title: 'Order', statement: 'Place an order.', sources: ['FEAT-001'] }],
    components: [],
    decisions: [],
    entities: [],
    phases: [{ name: 'First', goal: 'Orders.', exitCriteria: ['Orders run.'] }],
    tasks: [],
    risks: [],
    technical: { integrations: [], security: [], targets: [], environments: [] },
  };
}

describe('assemblePlan: the cards left out are named (Q-54)', () => {
  function leftOutOf(tasks: PlanDraft['tasks'], options = {}): readonly LeftOutCard[] {
    return assemblePlan({ ...draft(), tasks }, supported, options).leftOut;
  }

  it('RF-627 Q-54 names the position and the field of a card in a phase that does not exist', () => {
    const left = leftOutOf([draftTask(), draftTask({ phase: 7 })]);

    expect(left.map((each) => [each.position, each.field])).toEqual([[2, 'phase']]);
    expect(left[0]?.reason).toMatch(/phase/u);
  });

  it('RF-627 Q-54 names riskClass for a card with no class, and a card rule for the others', () => {
    const left = leftOutOf([
      draftTask({ riskClass: undefined }),
      draftTask({ invariant: '' }),
      draftTask({ adds: ['parser'], probes: [] }),
    ]);

    expect(left.map((each) => [each.position, each.field])).toEqual([
      ...[
        [1, 'riskClass'],
        [2, 'invariant'],
        [3, 'probes'],
      ],
    ]);
    expect(left[1]?.reason).toBe('The card states no invariant.');
    expect(left[2]?.reason).toMatch(/review probes/u);
  });
});

describe('assemblePlan: more cards left out (Q-54)', () => {
  const specified = { specificationDriven: true };

  function leftOutOf(tasks: PlanDraft['tasks'], options = {}): readonly LeftOutCard[] {
    return assemblePlan({ ...draft(), tasks }, supported, options).leftOut;
  }

  it('RF-627 Q-54 names acceptanceCriteria for a Done-when item that is not a scenario', () => {
    const left = leftOutOf([draftTask({ acceptanceCriteria: ['The order is stored.'] })]);

    expect(left).toMatchObject([{ position: 1, field: 'acceptanceCriteria' }]);
  });

  it('RF-627 Q-54 names requirements for a card that implements none, given SDD', () => {
    const left = leftOutOf([draftTask({ requirements: [9] })], specified);

    expect(left).toMatchObject([{ position: 1, field: 'requirements' }]);
  });

  it('RF-627 Q-54 lists no card when every card is written, and holds no text of a card', () => {
    const tasks = [draftTask({ title: 'sentinel-title' }), draftTask({ phase: 7 })];

    expect(leftOutOf([draftTask()])).toEqual([]);
    expect(JSON.stringify(leftOutOf(tasks))).not.toContain('sentinel-title');
  });
});

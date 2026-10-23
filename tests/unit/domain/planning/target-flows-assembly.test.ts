import { describe, expect, it } from 'vitest';
import { assembleFlows } from '../../../../src/domain/planning/target-flows-assembly.js';
import {
  flowCardsOf,
  MAX_FLOWS,
  type FlowsDraft,
} from '../../../../src/domain/planning/target-flows.js';
import {
  checkoutCards,
  checkoutDraft,
  components,
  flowCard,
  rejectedFlowCard,
} from '../../../support/flow-fixtures.js';

// RF-625, Q-27, ADR-013: the planner's flows are untrusted. Every verified FLOW card ends up
// mapped to components or listed as out of scope; a step is a supported claim of its own card; a
// component the architecture does not have maps nothing.

function assembled(draft: FlowsDraft | undefined, names: readonly string[] = components) {
  const all = checkoutCards();
  return assembleFlows(draft, flowCardsOf(all), { components: names, allCards: all });
}

function firstFlow(): FlowsDraft['flows'][number] {
  const first = checkoutDraft().flows[0];
  if (first === undefined) throw new Error('The draft has a flow');
  return first;
}

describe('flowCardsOf', () => {
  it('RF-625 keeps FLOW cards with a supported step and nothing else', () => {
    const cards = [...checkoutCards(), rejectedFlowCard('FLOW-009')];

    expect(flowCardsOf(cards).map((card) => card.id)).toEqual(['FLOW-001', 'FLOW-002']);
  });
});

describe('assembleFlows: mapping', () => {
  it('RF-625 maps each step of a verified flow to the component the planner named', () => {
    const { flows } = assembled(checkoutDraft());

    const [flow] = flows.flows;
    expect(flow?.cardId).toBe('FLOW-001');
    expect(flow?.trigger).toBe('Journey FLOW-001 starts.');
    expect(flow?.steps.map((step) => [step.claimId, step.component, step.action])).toEqual([
      ['FLOW-001.c1', 'Web front end', 'Sends the basket.'],
      ['FLOW-001.c2', 'Order service', 'Saves the order.'],
      ['FLOW-001.c3', null, ''],
    ]);
  });

  it('RF-625 a component the architecture does not have maps nothing and is counted', () => {
    const { flows, leftOut } = assembled(checkoutDraft());

    expect(flows.flows[0]?.steps[2]?.component).toBeNull();
    expect(leftOut).toEqual({ flows: 0, steps: 1 });
  });

  it('RF-625 a step names the card it touches only when that card is among the supported ones', () => {
    const { flows } = assembled(checkoutDraft());

    expect(flows.flows[0]?.steps.map((step) => step.touches)).toEqual([null, 'ENT-001', null]);
  });
});

describe('assembleFlows: steps the checks refuse', () => {
  it('RF-625 a step of another card, a repeated step and an unknown card are refused and counted', () => {
    const draft: FlowsDraft = {
      flows: [
        {
          ...{ card: 'FLOW-001', inScope: true, reason: '' },
          steps: [
            { claim: 'FLOW-001.c1', component: 'Database', action: 'First.' },
            { claim: 'FLOW-001.c1', component: 'Order service', action: 'Again.' },
            { claim: 'FLOW-002.c1', component: 'Order service', action: 'Elsewhere.' },
          ],
        },
        { card: 'FLOW-077', inScope: true, reason: '', steps: [] },
      ],
    };

    const { flows, leftOut } = assembled(draft);

    expect(flows.flows[0]?.steps.map((step) => step.component)).toEqual([
      'Database',
      'Database',
      'Database',
    ]); // the others cite the same file
    expect(leftOut).toEqual({ flows: 1, steps: 2 });
  });

  it('RF-625 a card the planner gave two entries takes the first', () => {
    const first = firstFlow();
    const draft = { flows: [first, { ...first, inScope: false, reason: 'Second.' }] };

    const { flows } = assembled(draft);

    expect(flows.flows.map((flow) => flow.cardId)).toEqual(['FLOW-001']);
  });
});

describe('assembleFlows: every verified flow is mapped or listed', () => {
  it('RF-625 lists a journey the planner put out of scope with its reason', () => {
    const { flows } = assembled(checkoutDraft());

    expect(flows.outOfScope).toContainEqual({
      ...{ cardId: 'FLOW-002', title: 'Journey FLOW-002' },
      reason: 'Staff tooling stays as it is.',
      byPlanner: true,
    });
  });

  it('RF-625 lists a journey the planner said nothing about, with a reason that says so', () => {
    const { flows } = assembled({ flows: [firstFlow()] });

    const [left] = flows.outOfScope;
    expect(left).toMatchObject({ cardId: 'FLOW-002', byPlanner: false });
    expect(left?.reason).toContain('neither mapped nor left out');
  });
});

describe('assembleFlows: journeys out of scope', () => {
  it('RF-625 a journey put out of scope without a reason still gets one', () => {
    const draft = { flows: [{ card: 'FLOW-002', inScope: false, reason: '', steps: [] }] };

    const left = assembled(draft).flows.outOfScope.find((flow) => flow.cardId === 'FLOW-002');

    expect(left?.reason).not.toBe('');
  });

  it('RF-625 an in-scope journey with no step placed is listed as out of scope', () => {
    const draft = { flows: [{ card: 'FLOW-002', inScope: true, reason: '', steps: [] }] };

    const { flows } = assembled(draft);

    expect(flows.flows).toEqual([]);
    const left = flows.outOfScope.find((flow) => flow.cardId === 'FLOW-002');
    expect(left?.reason).toContain('none of its steps');
  });
});

describe('assembleFlows: no answer and no architecture', () => {
  it('RF-625 without a readable answer every verified journey is out of scope', () => {
    const { flows } = assembled(undefined);

    expect(flows.flows).toEqual([]);
    expect(flows.outOfScope.map((flow) => flow.cardId)).toEqual(['FLOW-001', 'FLOW-002']);
  });

  it('RF-625 an architecture without a component maps nothing, whatever the answer says', () => {
    const { flows } = assembled(checkoutDraft(), []);

    expect(flows.flows).toEqual([]);
    expect(flows.outOfScope.map((flow) => flow.reason)).toEqual([
      expect.stringContaining('no component'),
      expect.stringContaining('no component'),
    ]);
  });
});

describe('assembleFlows: the cap', () => {
  it('Q-27 maps at most 15 journeys and lists the rest with their cards and the reason', () => {
    const cards = Array.from({ length: MAX_FLOWS + 2 }, (_, index) =>
      flowCard(`FLOW-${String(index + 1).padStart(3, '0')}`, [{ text: 'A step.' }]),
    );
    const draft: FlowsDraft = {
      flows: cards.map((card) => ({
        ...{ card: card.id, inScope: true, reason: '' },
        steps: [{ claim: `${card.id}.c1`, component: 'Database', action: 'Does it.' }],
      })),
    };

    const { flows } = assembleFlows(draft, cards, { components, allCards: cards });

    expect(flows.flows).toHaveLength(MAX_FLOWS);
    expect(flows.flows.at(-1)?.cardId).toBe('FLOW-015');
    expect(flows.outOfScope.map((flow) => flow.cardId)).toEqual(['FLOW-016', 'FLOW-017']);
    expect(flows.outOfScope[0]?.reason).toContain('cap');
  });
});

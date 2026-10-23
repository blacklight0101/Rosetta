import type { SourceCard } from '../../src/domain/planning/plan-sources.js';
import type { FlowsDraft, MappedFlow } from '../../src/domain/planning/target-flows.js';

// RF-625: the verified `FLOW` cards, the architecture and the planner's draft the target flows
// tests start from, built by hand so a domain or writer test needs no card files.

const citation = { path: 'src/Orders/Checkout.cs', startLine: 3, endLine: 9 };

interface StepInput {
  readonly text: string;
  readonly target?: string;
}

/** A `FLOW` card whose steps are all supported claims, in order. */
export function flowCard(
  id: string,
  steps: readonly StepInput[],
  title = `Journey ${id}`,
): SourceCard {
  return {
    ...{ id, type: 'FLOW', title, summary: `${title}.`, area: 'orders' },
    flow: { trigger: `${title} starts.`, outcome: `${title} ends.` },
    claims: steps.map((each, index) => ({
      ...{ claimId: `${id}.c${String(index + 1)}`, text: each.text },
      ...{ citations: [citation], status: 'Supported' as const },
      ...(each.target === undefined ? {} : { target: each.target }),
    })),
  };
}

/** The same card with every step rejected by the verifier. */
export function rejectedFlowCard(id: string): SourceCard {
  const card = flowCard(id, [{ text: 'A step.' }]);
  return { ...card, claims: card.claims.map((claim) => ({ ...claim, status: 'Rejected' })) };
}

/** A card of another type, which a flow step may touch. */
function touchedCard(id: string): SourceCard {
  return {
    ...{ id, type: 'ENT', title: 'Order', summary: 'An order.', area: 'orders' },
    claims: [
      {
        ...{ claimId: `${id}.c1`, text: 'An order has lines.' },
        ...{ citations: [citation], status: 'Supported' as const },
      },
    ],
  };
}

export const components = ['Web front end', 'Order service', 'Database'] as const;

/** FLOW-001 (three steps), FLOW-002 (one) and the ENT card FLOW-001's second step touches. */
export function checkoutCards(): SourceCard[] {
  return [
    flowCard('FLOW-001', [
      { text: 'The page posts the basket.' },
      { text: 'The order is saved.', target: 'ENT-001' },
      { text: 'The payment is taken.', target: 'INT-009' },
    ]),
    flowCard('FLOW-002', [{ text: 'Staff export the orders.' }]),
    touchedCard('ENT-001'),
  ];
}

/** The planner's draft: FLOW-001 with two steps placed and one in a component the architecture lacks. */
export function checkoutDraft(): FlowsDraft {
  return {
    flows: [
      {
        ...{ card: 'FLOW-001', inScope: true, reason: '' },
        steps: [
          { claim: 'FLOW-001.c1', component: 'Web front end', action: 'Sends the basket.' },
          { claim: 'FLOW-001.c2', component: 'Order service', action: 'Saves the order.' },
          { claim: 'FLOW-001.c3', component: 'Payment gateway', action: 'Takes the payment.' },
        ],
      },
      { card: 'FLOW-002', inScope: false, reason: 'Staff tooling stays as it is.', steps: [] },
    ],
  };
}

/** A checked flow with this text in every field a person can read; its second step maps nothing. */
export function mappedFlow(text: string): MappedFlow {
  const step = {
    ...{ claimId: 'FLOW-001.c1', text, touches: null, component: text },
    ...{ action: text, files: [] },
  };
  return {
    ...{ cardId: 'FLOW-001', title: text, trigger: text, outcome: text },
    steps: [step, { ...step, claimId: 'FLOW-001.c2', component: null, action: '' }],
  };
}

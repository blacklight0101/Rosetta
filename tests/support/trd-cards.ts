import { createCard, transitionClaim, type Card } from '../../src/domain/cards/card.js';
import { planCards } from './plan-cards.js';

// RF-622: the cards a technical-requirements test plans from: the order-shop cards of the plan
// tests and two integration cards, each with one supported claim.

const verdict = {
  step: 'judgement',
  reason: 'Checked.',
  model: 'judge-model',
  at: '2026-10-12T09:00:00.000Z',
} as const;

function integration(id: string, title: string, claim: string, path: string): Card {
  const created = createCard({
    ...{ id, type: 'INT', title, summary: `${title}, as the code shows it.`, area: 'orders' },
    ...{ agentTaskId: 'task-orders', confidence: 'High' },
    claims: [{ text: claim, citations: [{ path, startLine: 3, endLine: 9 }] }],
  });
  if (!created.ok) throw new Error(`The card ${id} is not valid: ${created.error}`);
  const judged = transitionClaim(created.value, `${id}.c1`, 'Supported', verdict);
  if (!judged.ok) throw new Error(`The claim of ${id} cannot become Supported`);
  return judged.value;
}

/** The plan cards and two supported `INT` cards. */
export function trdCards(): readonly Card[] {
  return [
    ...planCards(),
    integration('INT-001', 'Payment gateway', 'Checkout charges the card.', 'src/Orders/Pay.cs'),
    integration('INT-002', 'Warehouse mail', 'Checkout mails the warehouse.', 'src/Orders/Mail.cs'),
  ];
}

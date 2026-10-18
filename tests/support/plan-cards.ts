import {
  createCard,
  transitionClaim,
  type Card,
  type CardInput,
} from '../../src/domain/cards/card.js';
import type { ClaimStatus } from '../../src/domain/cards/card-vocabulary.js';

// RF-604: the cards of the understand run a plan test plans from, each claim in the status the
// judgement step left it in: supported claims, a rejected one, an invalid citation, a card whose
// only claim was never judged, and two open questions.

const verdict = {
  step: 'judgement',
  reason: 'Checked.',
  model: 'judge-model',
  at: '2026-10-12T09:00:00.000Z',
} as const;

function claim(text: string, path: string): CardInput['claims'][number] {
  return { text, citations: [{ path, startLine: 3, endLine: 9 }] };
}

/** A card whose claims end in these statuses, in order (`Proposed` stays as written). */
function judgedCard(input: CardInput, statuses: readonly ClaimStatus[]): Card {
  const created = createCard(input);
  if (!created.ok) throw new Error(`The card ${input.id} is not valid: ${created.error}`);
  let card = created.value;
  statuses.forEach((status, index) => {
    if (status === 'Proposed') return;
    const changed = transitionClaim(card, `${input.id}.c${String(index + 1)}`, status, verdict);
    if (!changed.ok) throw new Error(`The claim cannot become ${status}`);
    card = changed.value;
  });
  return card;
}

function base(id: string, type: CardInput['type'], title: string): Omit<CardInput, 'claims'> {
  return {
    ...{ id, type, title, summary: `${title}, as the code shows it.`, area: 'orders' },
    ...{ agentTaskId: 'task-orders', confidence: 'High' },
  };
}

/** The cards about orders: supported, rejected, invalid and never-judged claims. */
function orderCards(): Card[] {
  return [
    judgedCard(
      {
        ...base('FEAT-001', 'FEAT', 'Place an order'),
        claims: [
          claim('Checkout creates an order from the basket.', 'src/Orders/Checkout.cs'),
          claim('Checkout emails the warehouse.', 'src/Orders/Mail.cs'),
        ],
      },
      ['Supported', 'Rejected'],
    ),
    judgedCard(
      {
        ...base('BR-001', 'BR', 'Free shipping over 50'),
        claims: [claim('Orders over 50 ship free.', 'src/Orders/Shipping.cs')],
      },
      ['Supported'],
    ),
    judgedCard(
      {
        ...base('ENT-001', 'ENT', 'Order'),
        claims: [
          claim('An order has lines and a status.', 'src/Orders/Order.cs'),
          claim('An order keeps the card number.', 'src/Orders/Missing.cs'),
        ],
      },
      ['Supported', 'CitationInvalid'],
    ),
    judgedCard(
      {
        ...base('FEAT-002', 'FEAT', 'Export orders'),
        claims: [claim('Staff export the orders of a day.', 'src/Orders/Export.cs')],
      },
      ['Unverified'],
    ),
  ];
}

/** The two open questions: one with a supported claim, one never judged. */
function questionCards(): Card[] {
  return [
    judgedCard(
      {
        ...base('OQ-001', 'OQ', 'Who may cancel a paid order?'),
        question: 'Which roles may cancel a paid order?',
        whyItMatters: 'The new system must keep the rule.',
        claims: [claim('Cancel checks no role.', 'src/Orders/Cancel.cs')],
      },
      ['Supported'],
    ),
    judgedCard(
      {
        ...base('OQ-002', 'OQ', 'Are refunds automatic?'),
        question: 'Does a cancelled order refund the customer on its own?',
        whyItMatters: 'Refunds move money.',
        claims: [claim('Cancel calls a refund stub.', 'src/Orders/Refund.cs')],
      },
      ['Proposed'],
    ),
  ];
}

/** The cards of the seeded run. */
export function planCards(): readonly Card[] {
  return [...orderCards(), ...questionCards()];
}

/** The open questions of the seeded run. */
export const planQuestions = [
  { cardId: 'OQ-001', question: 'Which roles may cancel a paid order?' },
  { cardId: 'OQ-002', question: 'Does a cancelled order refund the customer on its own?' },
] as const;

/** A card with one supported claim that says what the test needs it to say (an attack on the request). */
export function cardSaying(id: string, text: string): Card {
  return judgedCard(
    { ...base(id, 'BR', 'Attack on the request'), claims: [claim(text, 'src/Orders/Evil.cs')] },
    ['Supported'],
  );
}

/** RF-623: a second `ENT` card with four supported claims, for the data model tests. */
export function customerCard(): Card {
  const claims = [
    claim('A customer has an email.', 'src/Orders/Customer.cs'),
    claim('A customer has a loyalty tier.', 'src/Orders/Customer.cs'),
    claim('A customer has a fax number.', 'src/Orders/Customer.cs'),
    claim('A customer has a nickname.', 'src/Orders/Customer.cs'),
  ];
  return judgedCard({ ...base('ENT-002', 'ENT', 'Customer'), claims }, [
    'Supported',
    'Supported',
    'Supported',
    'Supported',
  ]);
}

/** RF-623, RNF-003: an `ENT` card with one supported claim that says what the test needs it to say. */
export function entityCardSaying(id: string, text: string): Card {
  return judgedCard(
    { ...base(id, 'ENT', 'Customer'), claims: [claim(text, 'src/Orders/Customer.cs')] },
    ['Supported'],
  );
}

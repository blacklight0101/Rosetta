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

export function claim(text: string, path: string): CardInput['claims'][number] {
  return { text, citations: [{ path, startLine: 3, endLine: 9 }] };
}

/** A card whose claims end in these statuses, in order (`Proposed` stays as written). */
export function judgedCard(input: CardInput, statuses: readonly ClaimStatus[]): Card {
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

export function base(
  id: string,
  type: CardInput['type'],
  title: string,
): Omit<CardInput, 'claims'> {
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

/** RF-624: a `FLOW` card with two supported steps, for the API contract tests. */
export function flowCard(): Card {
  const steps = [
    claim('The basket is validated.', 'src/Orders/Checkout.cs'),
    claim('The order is saved.', 'src/Orders/Checkout.cs'),
  ];
  return judgedCard(
    {
      ...base('FLOW-001', 'FLOW', 'Checkout journey'),
      flow: { trigger: 'The shopper presses Pay.', outcome: 'An order is stored.' },
      claims: steps,
    },
    ['Supported', 'Supported'],
  );
}

/** RNF-003, RF-624: a `FEAT` card with one supported claim that says what the test needs it to say. */
export function featureCardSaying(id: string, text: string): Card {
  return judgedCard(
    { ...base(id, 'FEAT', 'Attack on the contract'), claims: [claim(text, 'src/Orders/Evil.cs')] },
    ['Supported'],
  );
}

function flowBase(
  id: string,
  title: string,
  trigger: string,
  outcome: string,
): Omit<CardInput, 'claims'> {
  return { ...base(id, 'FLOW', title), flow: { trigger, outcome } };
}

function step(text: string, target?: string): CardInput['claims'][number] {
  return { ...claim(text, 'src/Orders/Checkout.cs'), ...(target === undefined ? {} : { target }) };
}

/**
 * RF-625: the `FLOW` cards a flows test adds to the seeded run. FLOW-001 has three supported steps
 * (one touching the supported card ENT-001, one touching a card the run does not have) and one
 * rejected; FLOW-002 and FLOW-003 are supported journeys; FLOW-004 has no supported step.
 */
export function orderFlowCards(): readonly Card[] {
  return [
    judgedCard(
      {
        ...flowBase(
          'FLOW-001',
          'Place an order',
          'The customer presses Pay on the checkout page.',
          'The order is stored and the customer sees a receipt.',
        ),
        claims: [
          step('The checkout page posts the basket.', 'FEAT-001'),
          step('The order is saved with its lines.', 'ENT-001'),
          step('The payment is taken.', 'INT-009'),
          step('The warehouse is emailed.'),
        ],
      },
      ['Supported', 'Supported', 'Supported', 'Rejected'],
    ),
    judgedCard(
      {
        ...flowBase('FLOW-002', 'Export orders', 'Staff open the export page.', 'A file is sent.'),
        claims: [step('The export lists the orders of a day.')],
      },
      ['Supported'],
    ),
    judgedCard(
      {
        ...flowBase(
          'FLOW-003',
          'Cancel an order',
          'Staff press Cancel.',
          'The order is cancelled.',
        ),
        claims: [step('Cancel marks the order cancelled.')],
      },
      ['Supported'],
    ),
    judgedCard(
      {
        ...flowBase('FLOW-004', 'Print a label', 'Staff press Print.', 'A label is printed.'),
        claims: [step('Print sends the label to the printer.')],
      },
      ['Rejected'],
    ),
  ];
}

/** RNF-003, RF-625: a `FLOW` card with one supported step that says what the test needs it to say. */
export function flowCardSaying(id: string, text: string): Card {
  return judgedCard(
    {
      ...flowBase(id, 'Attack on the request', 'A user acts.', 'Something happens.'),
      claims: [step(text)],
    },
    ['Supported'],
  );
}

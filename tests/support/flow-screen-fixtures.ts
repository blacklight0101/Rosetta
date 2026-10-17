import type { CardDraft } from '../../src/domain/cards/card-ids.js';
import type { ScreenDetail } from '../../src/domain/cards/flow-screen.js';
import { draftOf } from './card-fixtures.js';

// RF-260, RF-261: a valid FLOW and SCRN card as the agent writes it (citations as strings) and as
// the parser returns it, so each test changes only the field it is about.

const checkout = 'src/Orders/Checkout.cs';
const page = 'src/Web/Checkout.aspx';

export function flowObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'FLOW',
    title: 'Place an order',
    area: 'orders',
    summary: 'From the basket page to a stored order.',
    confidence: 'High',
    flow: { trigger: 'The shopper presses Pay.', outcome: 'An order is stored and mailed.' },
    claims: [
      { text: 'The basket is validated.', target: 'BR-001', citations: [`${checkout}:10-24`] },
      {
        text: 'The order is saved.',
        target: 'ENT-002',
        citations: [`${checkout}:30-48`],
        branches: [
          { text: 'A stock error shows the basket again.', citations: [`${checkout}:50-58`] },
        ],
      },
    ],
    ...overrides,
  };
}

export function screenObject(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'SCRN',
    title: 'Checkout page',
    area: 'orders',
    summary: 'The page where the shopper pays.',
    confidence: 'High',
    screen: {
      route: '/Checkout.aspx',
      roles: ['Customer'],
      fields: [
        {
          name: 'Email',
          inputKind: 'text',
          required: true,
          validations: [{ text: 'Must be an e-mail address.', citations: [`${page}:12-14`] }],
        },
      ],
      actions: [
        { label: 'Pay', handler: 'PayButton_Click' },
        { label: 'Back', flow: 'FLOW-001' },
      ],
      leadsTo: ['/Confirmation.aspx'],
    },
    claims: [{ text: 'The page is served at /Checkout.aspx.', citations: [`${page}:1-3`] }],
    ...overrides,
  };
}

export function flowDraft(overrides: Partial<CardDraft> = {}): CardDraft {
  return draftOf({
    type: 'FLOW',
    title: 'Place an order',
    flow: { trigger: 'The shopper presses Pay.', outcome: 'An order is stored and mailed.' },
    claims: [
      {
        text: 'The order is saved.',
        target: 'ENT-002',
        citations: [{ path: checkout, startLine: 30, endLine: 48 }],
        branches: [
          {
            text: 'A stock error shows the basket again.',
            citations: [{ path: checkout, startLine: 50, endLine: 58 }],
          },
          {
            text: 'A payment error ends the flow.',
            citations: [{ path: checkout, startLine: 60, endLine: 66 }],
          },
        ],
      },
    ],
    ...overrides,
  });
}

export const validScreen: ScreenDetail = {
  route: '/Checkout.aspx',
  roles: ['Customer'],
  fields: [
    {
      name: 'Email',
      inputKind: 'text',
      required: true,
      validations: [
        {
          text: 'Must be an e-mail address.',
          citations: [{ path: page, startLine: 12, endLine: 14 }],
        },
      ],
    },
  ],
  actions: [
    { label: 'Pay', handler: 'PayButton_Click' },
    { label: 'Back', flow: 'FLOW-001' },
  ],
  leadsTo: ['/Confirmation.aspx'],
};

export function screenDraft(screen: ScreenDetail = validScreen): CardDraft {
  return draftOf({ type: 'SCRN', title: 'Checkout page', screen });
}

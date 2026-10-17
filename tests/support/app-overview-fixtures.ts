import type { Card } from '../../src/domain/cards/card.js';
import { assignCardIds } from '../../src/domain/cards/card-ids.js';
import type { Overview } from '../../src/domain/overview/overview.js';
import { draftOf } from './card-fixtures.js';

// RF-264: cards and overviews for the tests of the overview of the application.

function drafts(area: string, titles: readonly string[]) {
  return titles.map((title, index) =>
    draftOf({
      type: index === 0 ? 'FEAT' : 'ENT',
      title,
      claims: [
        {
          text: `${title} is implemented.`,
          citations: [{ path: `src/${area}/${title}.cs`, startLine: 1, endLine: 9 }],
        },
      ],
    }),
  );
}

/**
 * FEAT-001, ENT-001 (Orders), FEAT-002, ENT-002 (Billing) and OQ-001 (Orders) citing a file that
 * ENT-001 cites, so it concerns the section that links ENT-001.
 */
export function overviewCards(): readonly Card[] {
  const question = draftOf({
    type: 'OQ',
    title: 'Who cancels?',
    confidence: 'Low',
    question: 'Which roles may cancel an order?',
    whyItMatters: 'Same rule in the new system.',
    claims: [
      {
        text: 'Cancel is reachable from the order page.',
        citations: [{ path: 'src/Orders/Order.cs', startLine: 3, endLine: 5 }],
      },
    ],
  });
  const cards = assignCardIds([
    {
      agentTaskId: 'reader-001',
      area: 'Orders',
      drafts: [...drafts('Orders', ['Checkout', 'Order']), question],
    },
    {
      agentTaskId: 'reader-002',
      area: 'Billing',
      drafts: drafts('Billing', ['Invoicing', 'Client']),
    },
  ]);
  if (!cards.ok) throw new Error('The overview fixture cards are invalid.');
  return cards.value;
}

/** The same cards with every claim of `ids` set to `status`. */
export function withStatus(
  cards: readonly Card[],
  ids: readonly string[],
  status: 'CitationInvalid' | 'Rejected' | 'Supported' | 'Unverified',
): readonly Card[] {
  return cards.map((card) =>
    ids.includes(card.id)
      ? { ...card, claims: card.claims.map((claim) => ({ ...claim, status })) }
      : card,
  );
}

/** A full overview with one feature statement linking FEAT-001 and ENT-001. */
export function fullOverview(extra: Partial<Overview> = {}): Overview {
  return {
    state: 'full',
    sections: [
      {
        id: 'application',
        statements: [{ text: 'A small shop front.', cards: [{ id: 'FEAT-001', type: 'FEAT' }] }],
      },
      {
        id: 'features',
        statements: [
          {
            text: 'Orders are placed at checkout.',
            cards: [
              { id: 'FEAT-001', type: 'FEAT' },
              { id: 'ENT-001', type: 'ENT' },
            ],
          },
        ],
      },
    ],
    notCovered: ['Vendor: third-party code; nothing about the application was read from it.'],
    questions: [{ cardId: 'OQ-001', section: 'features' }],
    ...extra,
  };
}

/** What a well-behaved summariser answers for `overviewCards()`. */
export const goodOverviewAnswer = JSON.stringify({
  application: [{ text: 'A small shop front.', cards: ['FEAT-001', 'FEAT-002'] }],
  users: [],
  features: [
    { text: 'Orders are placed at checkout.', cards: ['FEAT-001', 'ENT-001'] },
    { text: 'Invoices are produced.', cards: ['FEAT-002'] },
  ],
  screens: [],
  data: [{ text: 'Clients and orders are stored.', cards: ['ENT-001', 'ENT-002'] }],
  integrations: [],
});

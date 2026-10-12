import type { CardDraft, TaskCards } from '../../src/domain/cards/card-ids.js';
import type { CommitSha } from '../../src/domain/sources/commit-sha.js';

export const cardSource: {
  readonly owner: string;
  readonly repo: string;
  readonly commitSha: CommitSha;
} = {
  owner: 'octo',
  repo: 'demo',
  commitSha: { value: '3f786850e387550fdab836ed7e6dc881de23001b' },
};

/** A valid draft as the parser returns it; override what a test cares about. */
export function draftOf(overrides: Partial<CardDraft> = {}): CardDraft {
  return {
    type: 'FEAT',
    title: 'Order checkout',
    summary: 'The shop turns a basket into an order.',
    area: 'orders',
    confidence: 'High',
    claims: [
      {
        text: 'Checkout creates an order from the basket.',
        citations: [{ path: 'src/Orders/Checkout.cs', startLine: 10, endLine: 24 }],
      },
    ],
    ...overrides,
  };
}

export function oqDraft(): CardDraft {
  return draftOf({
    type: 'OQ',
    title: 'Who may cancel an order?',
    summary: 'The code does not show a role check.',
    confidence: 'Low',
    question: 'Which roles may cancel a paid order?',
    whyItMatters: 'The new system must enforce the same rule.',
  });
}

/** Two areas, mixed types, in the order the run visited them. */
export function twoAreas(): readonly TaskCards[] {
  return [
    {
      agentTaskId: 'task-orders',
      area: 'orders',
      drafts: [
        draftOf(),
        draftOf({ type: 'BR', title: 'Free shipping over 50' }),
        draftOf({ title: 'Order cancellation' }),
        oqDraft(),
      ],
    },
    {
      agentTaskId: 'task-catalog',
      area: 'catalog',
      drafts: [
        draftOf({ type: 'ENT', title: 'Product', area: 'catalog' }),
        draftOf({ title: 'Product search', area: 'catalog' }),
        draftOf({ type: 'BR', title: 'Hidden products', area: 'catalog' }),
      ],
    },
  ];
}

/** The agent's JSON answer for one valid card, with citations as strings. */
export const validCardJson = JSON.stringify({
  cards: [
    {
      type: 'FEAT',
      title: 'Order checkout',
      area: 'orders',
      summary: 'The shop turns a basket into an order.',
      confidence: 'High',
      claims: [
        {
          text: 'Checkout creates an order from the basket.',
          citations: ['src/Orders/Checkout.cs:10-24'],
        },
      ],
    },
  ],
});

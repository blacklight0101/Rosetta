import { describe, expect, it } from 'vitest';
import type { TaskResult } from '../../../../src/application/ports/task-results.js';
import { createCard, type Card, type CardInput } from '../../../../src/domain/cards/card.js';
import { FileTaskResults } from '../../../../src/infrastructure/cards/file-task-results.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { openWriter } from '../../../support/open-writer.js';
import { useTempRoot } from '../../../support/temp-root.js';

// RF-006, RF-260, RF-261, RF-263: a resumed run keeps a finished task as it was, so the stored
// results hold the whole FLOW and SCRN cards (steps with their targets and branches, screen
// fields, validations and actions) and the flow and screen coverage of the area.

const userId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e6f';
const projectId = '0b7c3f8e-5d1a-4c2b-9e6f-1a2b3c4d5e70';
const scope = { id: 'run-1', userId, projectId, runKey: '20261012-100000-understand' };

const cite = (path: string, startLine: number, endLine: number) => ({ path, startLine, endLine });

const base = {
  area: 'Orders',
  agentTaskId: 'reader-001',
  confidence: 'High',
  summary: 'The summary.',
} as const;

const flowInput: CardInput = {
  ...base,
  id: 'FLOW-001',
  type: 'FLOW',
  title: 'Place an order',
  flow: { trigger: 'The user presses Place order.', outcome: 'The order is stored.' },
  claims: [
    {
      text: 'The checkout page validates the e-mail.',
      citations: [cite('Orders/Checkout.aspx.cs', 8, 12)],
      target: 'SCRN-001',
      branches: [
        {
          text: 'A blank e-mail stops the post.',
          citations: [cite('Orders/Checkout.aspx.cs', 9, 10)],
        },
      ],
    },
    { text: 'The service stores the order.', citations: [cite('Services/OrderService.cs', 6, 9)] },
  ],
};

const screenInput: CardInput = {
  ...base,
  id: 'SCRN-001',
  type: 'SCRN',
  title: 'Checkout',
  claims: [{ text: 'The page has a form.', citations: [cite('Orders/Checkout.aspx', 1, 8)] }],
  screen: {
    route: '/Orders/Checkout.aspx',
    roles: ['Customer'],
    fields: [
      {
        name: 'Email',
        inputKind: 'text',
        required: true,
        validations: [
          { text: 'Must be an e-mail.', citations: [cite('Orders/Checkout.aspx', 3, 3)] },
        ],
      },
    ],
    actions: [{ label: 'Place order', handler: 'PlaceOrder_Click' }],
    leadsTo: ['/Orders/Confirm.aspx'],
  },
};

function cardOf(input: CardInput): Card {
  const created = createCard(input);
  if (!created.ok) throw new Error(`The card was refused: ${created.error}`);
  return created.value;
}

const result: TaskResult = {
  agentTaskId: 'reader-001',
  area: 'Orders',
  state: 'Done',
  turns: 2,
  withoutCards: false,
  cards: [cardOf(flowInput), cardOf(screenInput)],
  coverage: {
    area: 'Orders',
    files: [{ path: 'Orders/Checkout.aspx', read: [{ startLine: 1, endLine: 8 }] }],
    tokens: 100,
    readTokens: 80,
    readTokenShare: 0.8,
    surface: { flowsMarked: true, screensMarked: true, flowCards: 1, screenCards: 1 },
  },
};

describe('FileTaskResults with flows and screens', () => {
  const data = useTempRoot('rosetta-task-results-flow-');

  it('RF-006 reads back FLOW and SCRN cards whole, with step targets, branches and fields', async () => {
    const results = new FileTaskResults({
      writer: openWriter(data.path),
      masker: new SecretMasker(),
    });

    await results.write(scope, [result]);

    expect(await results.read(scope)).toEqual([result]);
  });

  it('RF-263 reads back the flow and screen coverage of the area', async () => {
    const results = new FileTaskResults({
      writer: openWriter(data.path),
      masker: new SecretMasker(),
    });

    await results.write(scope, [result]);

    const [read] = await results.read(scope);
    expect(read?.coverage.surface).toEqual(result.coverage.surface);
  });
});

describe('FileTaskResults: incomplete flows and cards from before screen claims', () => {
  const data = useTempRoot('rosetta-task-results-incomplete-');
  const store = () =>
    new FileTaskResults({ writer: openWriter(data.path), masker: new SecretMasker() });

  it('RF-260 reads back the incomplete flow count of the area', async () => {
    const surface = { flowsMarked: true, screensMarked: true, flowCards: 3, screenCards: 1 };
    const counted = {
      ...result,
      coverage: { ...result.coverage, surface: { ...surface, incompleteFlows: 2 } },
    };
    const results = store();

    await results.write(scope, [counted]);

    const [read] = await results.read(scope);
    expect(read?.coverage.surface?.incompleteFlows).toBe(2);
  });

  it('RF-261 a stored SCRN card without validation and action claims is read back as stored', async () => {
    const created = cardOf(screenInput);
    const older: Card = { ...created, claims: created.claims.slice(0, 1) };
    expect(created.claims.length).toBeGreaterThan(1);
    const results = store();

    await results.write(scope, [{ ...result, cards: [older] }]);

    const [read] = await results.read(scope);
    expect(read?.cards[0]?.claims.map((claim) => claim.claimId)).toEqual(['SCRN-001.c1']);
    expect(read?.cards[0]).toEqual(older);
  });
});

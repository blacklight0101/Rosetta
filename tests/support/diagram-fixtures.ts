import type { Card, Claim } from '../../src/domain/cards/card.js';
import type { ClaimStatus } from '../../src/domain/cards/card-vocabulary.js';
import type { ScreenDetail } from '../../src/domain/cards/flow-screen.js';
import type { EntityModel } from '../../src/domain/diagrams/entity-diagram.js';

// RF-260, RF-261, RF-262, RF-508: verified cards and a data model for the diagram generators, so
// each test changes only the text it is about.

const cite = [{ path: 'src/Orders/Checkout.cs', startLine: 10, endLine: 24 }];

export function cardOf(overrides: Partial<Card> & Pick<Card, 'id' | 'type' | 'title'>): Card {
  return {
    summary: 'A card.',
    area: 'orders',
    agentTaskId: 'task-orders',
    confidence: 'High',
    claims: [{ claimId: `${overrides.id}.c1`, text: 'x', citations: cite, status: 'Supported' }],
    ...overrides,
  };
}

export interface StepInput {
  readonly text: string;
  readonly target?: string;
  readonly branches?: readonly string[];
  readonly status?: ClaimStatus;
}

function stepsOf(cardId: string, steps: readonly StepInput[]): readonly Claim[] {
  return steps.map((step, index) => ({
    claimId: `${cardId}.c${String(index + 1)}`,
    text: step.text,
    citations: cite,
    status: step.status ?? 'Supported',
    ...(step.target === undefined ? {} : { target: step.target }),
    ...(step.branches === undefined
      ? {}
      : {
          branches: step.branches.map((text, branch) => ({
            text,
            citations: cite,
            number: branch + 1,
          })),
        }),
  }));
}

export function flowCard(trigger: string, outcome: string, steps: readonly StepInput[]): Card {
  return cardOf({
    id: 'FLOW-001',
    type: 'FLOW',
    title: 'Place an order',
    flow: { trigger, outcome },
    claims: stepsOf('FLOW-001', steps),
  });
}

export function screenCard(id: string, route: string, leadsTo: readonly string[]): Card {
  const screen: ScreenDetail = { route, roles: ['Customer'], fields: [], actions: [], leadsTo };
  return cardOf({ id, type: 'SCRN', title: `Screen ${id}`, screen });
}

/** The demo shop: a basket, a checkout and a confirmation page. */
export function demoScreens(): readonly Card[] {
  return [
    screenCard('SCRN-002', '/Checkout.aspx', ['/Confirmation.aspx', 'SCRN-001']),
    screenCard('SCRN-001', '/Basket.aspx', ['SCRN-002']),
    screenCard('SCRN-003', '/Confirmation.aspx', ['/Default.aspx']),
  ];
}

export function demoModel(): EntityModel {
  return {
    entities: [
      {
        cardId: 'ENT-001',
        name: 'Customer',
        fields: [
          { name: 'Id', type: 'int', keys: ['PK'] },
          { name: 'Email', type: 'nvarchar(200)', keys: ['UK'] },
        ],
      },
      {
        cardId: 'ENT-002',
        name: 'Order',
        fields: [
          { name: 'Id', type: 'int', keys: ['PK'] },
          { name: 'CustomerId', type: 'int', keys: ['FK'] },
          { name: 'Notes' },
        ],
      },
      { cardId: 'ENT-003', name: 'OrderLine', fields: [] },
    ],
    relations: [
      {
        from: 'ENT-001',
        to: 'ENT-002',
        label: 'places',
        fromCardinality: 'one',
        toCardinality: 'zero-or-more',
      },
      {
        from: 'ENT-002',
        to: 'ENT-003',
        label: 'holds',
        fromCardinality: 'one',
        toCardinality: 'unknown',
      },
    ],
  };
}

import type { Card } from '../../src/domain/cards/card.js';
import type { ClaimStatus } from '../../src/domain/cards/card-vocabulary.js';
import { base, claim, judgedCard } from './plan-cards.js';

// RF-626: the `SCRN` cards a user-interface test adds to the seeded run of plan-cards.ts.

interface ScreenInput {
  readonly id: string;
  readonly title: string;
  readonly route: string;
  readonly roles?: readonly string[];
  readonly fields?: readonly {
    name: string;
    required?: boolean;
    inputKind?: string;
    status?: 'Rejected';
  }[];
  /** True for a card written before P3-29: only the claims the agent and the actions made. */
  readonly legacy?: boolean;
  /** An action's claim is `Supported` unless the test says the verifier rejected it. */
  readonly actions?: readonly {
    label: string;
    handler?: string;
    flow?: string;
    status?: 'Rejected';
  }[];
  readonly leadsTo?: readonly string[];
}

/** The status of each claim of a screen card in order: agent claim, actions, route, roles, fields, links. */
function judgements(input: ScreenInput): ClaimStatus[] {
  return [
    'Supported',
    ...(input.actions ?? []).map((action) => action.status ?? 'Supported'),
    'Supported',
    ...(input.roles ?? []).map((): ClaimStatus => 'Supported'),
    ...(input.fields ?? []).map((field): ClaimStatus => field.status ?? 'Supported'),
    ...(input.leadsTo ?? []).map((): ClaimStatus => 'Supported'),
  ];
}

/** RF-626: a `SCRN` card with one supported claim and the screen detail given. */
export function screenCard(input: ScreenInput): Card {
  const { id, title, route } = input;
  const fields = (input.fields ?? []).map((field) => ({
    ...{ name: field.name, inputKind: field.inputKind ?? 'text' },
    ...{ required: field.required ?? false, validations: [] },
  }));
  const screen = {
    ...{ route, roles: input.roles ?? [], fields },
    ...{ actions: input.actions ?? [], leadsTo: input.leadsTo ?? [] },
  };
  const statuses = judgements(input);
  const card = judgedCard(
    {
      ...base(id, 'SCRN', title),
      screen,
      claims: [claim(`${title} is shown.`, 'src/Orders/Orders.cshtml')],
    },
    statuses,
  );
  if (input.legacy !== true) return card;
  const kept = 1 + (input.actions ?? []).length;
  return { ...card, claims: card.claims.slice(0, kept) };
}

/**
 * RF-626: the screens a user-interface test adds to the seeded run. SCRN-001 (the order list) leads
 * to its detail, to the checkout and to a route nobody has; SCRN-004 and SCRN-005 are pages the
 * new shop does not need.
 */
export function orderScreenCards(): readonly Card[] {
  return [
    screenCard({
      ...{ id: 'SCRN-001', title: 'Orders list', route: '/orders' },
      roles: ['Shopper', 'Staff'],
      fields: [{ name: 'Search' }, { name: 'Status', inputKind: 'dropdown' }],
      actions: [
        { label: 'Open order', handler: 'openOrder' },
        { label: 'Place order', flow: 'FLOW-001' },
      ],
      leadsTo: ['SCRN-002', '/checkout', '/ghost'],
    }),
    screenCard({
      ...{ id: 'SCRN-002', title: 'Order detail', route: '/orders/detail', roles: ['Shopper'] },
      fields: [{ name: 'Order number', required: true }],
      actions: [{ label: 'Cancel order', handler: 'cancelOrder' }],
      leadsTo: ['SCRN-001'],
    }),
    screenCard({
      ...{ id: 'SCRN-003', title: 'Checkout', route: '/checkout' },
      fields: [{ name: 'Delivery address', required: true }],
      actions: [
        { label: 'Pay', flow: 'FLOW-001' },
        { label: 'Delete everything', handler: 'dropAll', status: 'Rejected' },
      ],
      leadsTo: ['SCRN-001'],
    }),
    screenCard({ id: 'SCRN-004', title: 'Fax confirmation', route: '/fax' }),
    screenCard({
      ...{ id: 'SCRN-005', title: 'Reports', route: '/reports' },
      leadsTo: ['SCRN-004'],
    }),
  ];
}

/** RNF-003, RF-626: a `SCRN` card whose field name says what the test needs it to say. */
export function screenCardWithField(id: string, name: string): Card {
  return screenCard({ id, title: 'Attack on the request', route: '/attack', fields: [{ name }] });
}

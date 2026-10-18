import type { SourceCard } from '../../src/domain/planning/plan-sources.js';
import type { TargetScreen, TargetUx, UxDraft } from '../../src/domain/planning/target-ux.js';

// RF-626: the verified `SCRN` cards and the planner's draft the user-interface tests start from,
// built by hand so a domain or writer test needs no card files.

const citation = { path: 'src/Orders/Orders.cshtml', startLine: 3, endLine: 9 };

interface ScreenInput {
  readonly title: string;
  readonly route: string;
  readonly roles?: readonly string[];
  readonly fields?: readonly { name: string; inputKind?: string; required?: boolean }[];
  readonly actions?: readonly { label: string; handler?: string; flow?: string }[];
  readonly leadsTo?: readonly string[];
}

/** A `SCRN` card with one supported claim and the screen detail given. */
export function screenCard(id: string, input: ScreenInput): SourceCard {
  const { title, route } = input;
  return {
    ...{ id, type: 'SCRN', title, summary: `${title}.`, area: 'orders' },
    screen: {
      route,
      roles: input.roles ?? [],
      fields: (input.fields ?? []).map((field) => ({
        ...{ name: field.name, inputKind: field.inputKind ?? 'text' },
        required: field.required ?? false,
      })),
      actions: input.actions ?? [],
      leadsTo: input.leadsTo ?? [],
    },
    claims: [
      {
        ...{ claimId: `${id}.c1`, text: `${title} is shown.` },
        ...{ citations: [citation], status: 'Supported' as const },
      },
    ],
  };
}

/** The same card with its claim rejected by the verifier. */
export function rejectedScreenCard(id: string): SourceCard {
  const card = screenCard(id, { title: 'Rejected screen', route: '/rejected' });
  return { ...card, claims: card.claims.map((claim) => ({ ...claim, status: 'Rejected' })) };
}

/**
 * Five screens of a shop: a list that leads to its detail and to the checkout, the detail, the
 * checkout, a fax page and a report page that leads to the fax page and to a route nobody has.
 */
export function shopScreens(): SourceCard[] {
  return [
    screenCard('SCRN-001', {
      title: 'Orders list',
      route: '/orders',
      roles: ['Shopper', 'Staff'],
      fields: [{ name: 'Search' }, { name: 'Status', inputKind: 'dropdown' }],
      actions: [
        { label: 'Open order', handler: 'openOrder' },
        { label: 'Place order', flow: 'FLOW-001' },
      ],
      leadsTo: ['SCRN-002', '/checkout'],
    }),
    screenCard('SCRN-002', {
      title: 'Order detail',
      route: '/orders/detail',
      roles: ['Shopper'],
      fields: [
        { name: 'Order number', required: true },
        { name: 'Search', required: true },
      ],
      actions: [{ label: 'Open order', handler: 'openOrder' }],
      leadsTo: ['SCRN-001', 'SCRN-002'],
    }),
    screenCard('SCRN-003', {
      title: 'Checkout',
      route: '/checkout',
      fields: [{ name: 'Delivery address', required: true }],
      actions: [{ label: 'Pay', flow: 'FLOW-001' }],
      leadsTo: ['SCRN-001'],
    }),
    screenCard('SCRN-004', { title: 'Fax confirmation', route: '/fax' }),
    screenCard('SCRN-005', {
      title: 'Reports',
      route: '/reports',
      leadsTo: ['SCRN-004', '/ghost'],
    }),
  ];
}

const brief = {
  audience: 'Shoppers and staff.',
  tone: 'Calm and plain.',
  components: ['Data table', 'Form field'],
};

/** The planner's draft: two screens merged into Orders, Checkout kept, the fax page dropped. */
export function shopDraft(): UxDraft {
  return {
    screens: [
      {
        ...{ name: 'Orders', purpose: 'Lists orders and shows one.' },
        ...{ reason: 'Same data, same people.', cards: ['SCRN-001', 'SCRN-002'] },
      },
      {
        ...{ name: 'Checkout', purpose: 'Takes the payment.' },
        ...{ reason: 'The main journey.', cards: ['SCRN-003'] },
      },
    ],
    dropped: [{ card: 'SCRN-004', reason: 'The fax page is not part of the new shop.' }],
    designBrief: brief,
  };
}

/** A target screen with this text in every field a person can read; it leads to a screen and a route. */
export function hostileScreen(text: string): TargetScreen {
  return {
    ...{ id: 'SCRN-001', name: text, purpose: text, reason: text, cards: ['SCRN-001'] },
    roles: [text],
    fields: [{ name: text, inputKind: text, required: true }],
    actions: [
      { label: text, handler: text, flow: null },
      { label: text, handler: null, flow: 'FLOW-001' },
    ],
    navigation: [
      { label: text, screenId: 'SCRN-002' },
      { label: text, screenId: null },
    ],
  };
}

/**
 * The checked material of two target screens (SCRN-001 merged with SCRN-002, SCRN-003 kept) and a
 * dropped legacy screen, with this text in every field a person can read.
 */
export function uxOf(text: string): TargetUx {
  const merged = { ...hostileScreen(text), id: 'SCRN-001', cards: ['SCRN-001', 'SCRN-002'] };
  const kept = { ...hostileScreen(text), id: 'SCRN-003', cards: ['SCRN-003'] };
  const legacy = (
    cardId: string,
    disposition: 'kept' | 'merged' | 'dropped',
    target: string | null,
  ) => ({
    ...{ cardId, title: text, route: text, disposition, target, reason: text },
  });
  return {
    screens: [merged, { ...kept, navigation: [] }],
    legacy: [
      legacy('SCRN-001', 'merged', 'SCRN-001'),
      legacy('SCRN-002', 'merged', 'SCRN-001'),
      legacy('SCRN-003', 'kept', 'SCRN-003'),
      legacy('SCRN-004', 'dropped', null),
    ],
    designBrief: { audience: text, tone: text, components: [text, 'Data table'] },
  };
}

/** The target screen Orders as the checks make it from `shopDraft()` over `shopScreens()`. */
export function ordersScreen(): TargetScreen {
  return {
    ...{ id: 'SCRN-001', name: 'Orders', purpose: 'Lists orders and shows one.' },
    ...{ reason: 'Same data, same people.', cards: ['SCRN-001', 'SCRN-002'] },
    roles: ['Shopper', 'Staff'],
    fields: [
      { name: 'Search', inputKind: 'text', required: true },
      { name: 'Status', inputKind: 'dropdown', required: false },
      { name: 'Order number', inputKind: 'text', required: true },
    ],
    actions: [
      { label: 'Open order', handler: 'openOrder', flow: null },
      { label: 'Place order', handler: null, flow: 'FLOW-001' },
    ],
    navigation: [{ label: 'Checkout', screenId: 'SCRN-003' }],
  };
}

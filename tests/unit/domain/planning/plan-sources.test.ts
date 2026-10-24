import { describe, expect, it } from 'vitest';
import {
  excludedClaims,
  supportedCards,
  type SourceCard,
} from '../../../../src/domain/planning/plan-sources.js';

// RF-604, ADR-005: only `Supported` claims reach the plan; every other claim is listed with its id.

const citation = { path: 'src/Orders/Checkout.cs', startLine: 1, endLine: 4 };

type Status = SourceCard['claims'][number]['status'];

function card(id: string, statuses: readonly Status[]): SourceCard {
  return {
    ...{ id, type: 'FEAT', title: `Title ${id}`, summary: 'Summary.', area: 'orders' },
    claims: statuses.map((status, index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text: `Claim ${String(index + 1)} of ${id}.`,
      citations: [citation],
      status,
    })),
  };
}

const cards = [
  card('FEAT-001', ['Supported', 'Rejected']),
  card('FEAT-002', ['Unverified', 'CitationInvalid', 'Proposed']),
  card('FEAT-003', ['Supported']),
];

describe('supportedCards', () => {
  it('RF-604 keeps only the Supported claims, in card order', () => {
    const kept = supportedCards(cards);

    expect(kept.map((each) => each.id)).toEqual(['FEAT-001', 'FEAT-003']);
    expect(kept[0]?.claims.map((claim) => claim.claimId)).toEqual(['FEAT-001.c1']);
  });

  it('RF-604 leaves out a card without a Supported claim', () => {
    expect(supportedCards([card('FEAT-002', ['Rejected'])])).toEqual([]);
  });
});

describe('excludedClaims', () => {
  it('RF-604 lists every rejected, invalid and unverified claim with its id and card', () => {
    expect(excludedClaims(cards)).toEqual([
      {
        claimId: 'FEAT-001.c2',
        cardId: 'FEAT-001',
        status: 'Rejected',
        cardType: 'FEAT',
        area: 'orders',
        citations: 1,
      },
      {
        claimId: 'FEAT-002.c1',
        cardId: 'FEAT-002',
        status: 'Unverified',
        cardType: 'FEAT',
        area: 'orders',
        citations: 1,
      },
      {
        claimId: 'FEAT-002.c2',
        cardId: 'FEAT-002',
        status: 'CitationInvalid',
        cardType: 'FEAT',
        area: 'orders',
        citations: 1,
      },
      {
        claimId: 'FEAT-002.c3',
        cardId: 'FEAT-002',
        status: 'Proposed',
        cardType: 'FEAT',
        area: 'orders',
        citations: 1,
      },
    ]);
  });
});

describe('supportedCards: the actions of a screen', () => {
  const claim = (n: number, text: string, status: Status): SourceCard['claims'][number] => ({
    ...{ claimId: `SCRN-001.c${String(n)}`, text, citations: [citation], status },
  });

  function screen(claims: SourceCard['claims']): SourceCard {
    return {
      ...{ id: 'SCRN-001', type: 'SCRN', title: 'Orders', summary: 'Summary.', area: 'orders' },
      screen: {
        ...{ route: '/orders', roles: [], fields: [], leadsTo: [] },
        actions: [
          { label: 'Open order', handler: 'openOrder' },
          { label: 'Pay', flow: 'FLOW-001' },
          { label: 'Cancel', handler: 'cancel', flow: 'FLOW-002' },
        ],
      },
      claims,
    };
  }

  it('RF-626 ADR-005 keeps an action only when the claim that states it is Supported', () => {
    const [kept] = supportedCards([
      screen([
        claim(1, 'Orders is shown.', 'Supported'),
        claim(2, 'Action Open order starts the handler openOrder.', 'Supported'),
        claim(3, 'Action Pay starts the flow FLOW-001.', 'Rejected'),
        claim(4, 'Action Cancel starts the handler cancel and the flow FLOW-002.', 'Supported'),
      ]),
    ]);

    expect(kept?.screen?.actions.map((action) => action.label)).toEqual(['Open order', 'Cancel']);
  });

  it('RF-626 a screen whose action claims are all unsupported keeps none, and the rest of the screen', () => {
    const [kept] = supportedCards([
      screen([
        claim(1, 'Orders is shown.', 'Supported'),
        claim(2, 'Action Open order starts the handler openOrder.', 'Unverified'),
      ]),
    ]);

    expect(kept?.screen).toMatchObject({ route: '/orders', actions: [] });
  });

  it('RF-626 a card without screen detail is unchanged', () => {
    const [kept] = supportedCards([card('FEAT-001', ['Supported'])]);

    expect(kept?.screen).toBeUndefined();
  });
});

const field = (name: string, required = false) => ({ name, inputKind: 'text', required });
const stated = {
  route: 'The screen is at the route /orders.',
  role: (role: string) => `The role ${role} can open the screen.`,
  field: (name: string, kind = 'optional') => `Field ${name} (text, ${kind}) is on the screen.`,
  link: (target: string) => `The screen leads to ${target}.`,
};

function screen(texts: Partial<Record<string, Status>>, legacy = false): SourceCard {
  const judged = Object.entries(texts).map(([text, status], index) => ({
    ...{ claimId: `SCRN-001.c${String(index + 2)}`, text, citations: [citation] },
    status: status ?? 'Supported',
  }));
  return {
    ...{ id: 'SCRN-001', type: 'SCRN', title: 'Orders', summary: 'Summary.', area: 'orders' },
    screen: {
      ...{ route: '/orders', roles: ['Staff', 'Guest'], actions: [] },
      fields: [field('Search'), field('Status', true)],
      leadsTo: ['/checkout', '/ghost'],
    },
    claims: [
      {
        ...{ claimId: 'SCRN-001.c1', text: 'Orders is shown.' },
        citations: [citation],
        status: 'Supported',
      },
      ...(legacy ? [] : judged),
    ],
  };
}

describe('supportedCards: the route, roles, fields and links of a screen', () => {
  it('RF-626 ADR-005 keeps a field only when the claim that states it is Supported', () => {
    const [kept] = supportedCards([
      screen({
        [stated.field('Search')]: 'Supported',
        [stated.field('Status', 'required')]: 'Rejected',
      }),
    ]);

    expect(kept?.screen?.fields.map((each) => each.name)).toEqual(['Search']);
    expect(kept?.screen?.uncheckedFields).toEqual([]);
    expect(kept?.screen?.unsupportedFields).toBe(1);
  });

  it('RF-626 ADR-005 keeps a role and a link only when its claim is not rejected or unverified', () => {
    const [kept] = supportedCards([
      screen({
        [stated.route]: 'Supported',
        [stated.role('Staff')]: 'Supported',
        [stated.role('Guest')]: 'Rejected',
        [stated.link('/checkout')]: 'Supported',
        [stated.link('/ghost')]: 'Unverified',
      }),
    ]);

    expect(kept?.screen).toMatchObject({
      ...{ route: '/orders', roles: ['Staff'], leadsTo: ['/checkout'] },
    });
  });
});

describe('supportedCards: unsupported and legacy screen parts', () => {
  it('RF-626 a route the verifier did not support is not kept', () => {
    const [kept] = supportedCards([screen({ [stated.route]: 'CitationInvalid' })]);

    expect(kept?.screen?.route).toBe('');
  });

  it('RF-626 a screen whose fields are all unsupported keeps none and counts them', () => {
    const [kept] = supportedCards([
      screen({
        [stated.field('Search')]: 'Rejected',
        [stated.field('Status', 'required')]: 'Unverified',
      }),
    ]);

    expect(kept?.screen).toMatchObject({ fields: [], uncheckedFields: [], unsupportedFields: 2 });
  });

  it('RF-626 a header-only legacy card keeps its fields as not checked, none as facts', () => {
    const [kept] = supportedCards([screen({}, true)]);

    expect(kept?.screen?.fields).toEqual([]);
    expect(kept?.screen?.uncheckedFields?.map((each) => each.name)).toEqual(['Search', 'Status']);
    expect(kept?.screen?.unsupportedFields).toBe(0);
    expect(kept?.screen).toMatchObject({ route: '/orders', roles: ['Staff', 'Guest'] });
  });
});

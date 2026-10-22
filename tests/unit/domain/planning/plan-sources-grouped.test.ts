import { describe, expect, it } from 'vitest';
import { supportedCards, type SourceCard } from '../../../../src/domain/planning/plan-sources.js';

// P3-106, RF-626, EV-06: the actions that start one handler are stated by one claim.

const citation = { path: 'src/Orders/Checkout.cs', startLine: 1, endLine: 4 };

const claim = (n: number, text: string): SourceCard['claims'][number] => ({
  ...{ claimId: `SCRN-001.c${String(n)}`, text, citations: [citation] },
  status: 'Supported',
});

const card: SourceCard = {
  ...{ id: 'SCRN-001', type: 'SCRN', title: 'Orders', summary: 'S.', area: 'orders' },
  claims: [
    claim(1, 'Orders is shown.'),
    claim(2, 'Actions Open order and Cancel start the handler openOrder.'),
  ],
  screen: {
    ...{ route: '/orders', roles: [], fields: [], leadsTo: [] },
    actions: [
      { label: 'Open order', handler: 'openOrder' },
      { label: 'Cancel', handler: 'openOrder' },
      { label: 'Pay', flow: 'FLOW-001' },
    ],
  },
};

describe('supportedCards: the grouped actions of a screen', () => {
  it('RF-626 the actions of one handler are kept when the one claim that lists them is Supported', () => {
    const [kept] = supportedCards([card]);

    expect(kept?.screen?.actions.map((action) => action.label)).toEqual(['Open order', 'Cancel']);
  });
});

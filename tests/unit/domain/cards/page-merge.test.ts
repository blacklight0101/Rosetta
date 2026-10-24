import { describe, expect, it } from 'vitest';
import { applyMerges } from '../../../../src/domain/cards/card-merge.js';
import { CARD_TYPES, type CardType } from '../../../../src/domain/cards/card-vocabulary.js';
import type { Card } from '../../../../src/domain/cards/card.js';
import { crossAreaMerges, pageMerges } from '../../../../src/domain/cards/page-merge.js';

// P5-32, P3-125, ADR-005: screen cards of one page become one card; cards of one type with one
// title in two areas become one card only when they cite the same file or name the same external
// system. Synthetic cards only.

interface Spec {
  readonly id: string;
  readonly type?: CardType;
  readonly title?: string;
  readonly area?: string;
  readonly route?: string;
  readonly claims: readonly (readonly [string, string])[];
}

function cardOf(spec: Spec): Card {
  const { id, type = 'SCRN', title = 'Orders page', area = 'web', claims } = spec;
  return {
    ...{ id, type, title, summary: title, area, agentTaskId: `t-${id}`, confidence: 'High' },
    claims: claims.map(([text, path], index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text,
      citations: [{ path, startLine: index + 1, endLine: index + 1 }],
      status: 'Supported',
    })),
    ...(spec.route === undefined
      ? {}
      : { screen: { route: spec.route, roles: [], fields: [], actions: [], leadsTo: [] } }),
  };
}

const pageOf = (id: string, route: string, texts: readonly string[]): Card =>
  cardOf({ id, route, claims: texts.map((text) => [text, 'Pages/Orders.cshtml'] as const) });

const idsOf = (merges: readonly { readonly ids: readonly string[] }[]): string[][] =>
  merges.map((merge) => [...merge.ids]);

describe('P5-32 pageMerges', () => {
  it('three screen cards of one route are one card with every distinct claim', () => {
    const cards = [
      pageOf('SCRN-001', '/Orders', ['Lists orders.']),
      pageOf('SCRN-002', '/orders/', ['Filters by date.']),
      pageOf('SCRN-003', '/Orders?x=1', ['Lists orders.', 'Exports to CSV.']),
    ];

    const merges = pageMerges(cards);
    const result = applyMerges(cards, merges, CARD_TYPES);

    expect(idsOf(merges)).toEqual([['SCRN-001', 'SCRN-002', 'SCRN-003']]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.claims.map((claim) => claim.text)).toEqual([
      'Lists orders.',
      'Filters by date.',
      'Exports to CSV.',
    ]);
    expect(result.cards[0]?.mergedFrom).toEqual(['SCRN-001', 'SCRN-002', 'SCRN-003']);
  });

  it('screen cards with no route that cite one page file are one merge', () => {
    const cards = [
      cardOf({ id: 'SCRN-001', claims: [['A.', 'Pages/Edit.cshtml']] }),
      cardOf({ id: 'SCRN-002', claims: [['B.', 'Pages/Edit.cshtml']] }),
    ];

    expect(idsOf(pageMerges(cards))).toEqual([['SCRN-001', 'SCRN-002']]);
  });

  it('a screen without a route joins the page whose file it cites', () => {
    const cards = [
      pageOf('SCRN-001', '/Orders', ['A.']),
      cardOf({ id: 'SCRN-002', claims: [['B.', 'Pages/Orders.cshtml']] }),
    ];

    expect(idsOf(pageMerges(cards))).toEqual([['SCRN-001', 'SCRN-002']]);
  });

  it('screens at one route in two areas are two applications, so they stay apart', () => {
    const cards = [
      cardOf({ id: 'SCRN-001', area: 'web', route: '/Home', claims: [['A.', 'web/Home.cshtml']] }),
      cardOf({ id: 'SCRN-002', area: 'adm', route: '/Home', claims: [['B.', 'adm/Home.cshtml']] }),
    ];

    expect(pageMerges(cards)).toEqual([]);
  });
});

describe('P5-32 pageMerges, pages kept apart and verdicts', () => {
  it('two routes that share a file stay two pages (P5-12)', () => {
    const cards = [pageOf('SCRN-001', '/Orders', ['A.']), pageOf('SCRN-002', '/Invoices', ['B.'])];

    expect(pageMerges(cards)).toEqual([]);
  });

  it('screens of two different pages stay apart', () => {
    const cards = [
      cardOf({ id: 'SCRN-001', route: '/A', claims: [['A.', 'a.cshtml']] }),
      cardOf({ id: 'SCRN-002', route: '/B', claims: [['B.', 'b.cshtml']] }),
    ];

    expect(pageMerges(cards)).toEqual([]);
  });

  it('ADR-005 the merged claims keep their verdicts and a rejected claim stays rejected', () => {
    const verdict = { step: 'judgement', reason: 'no', model: 'm', at: '2026-01-01T00:00:00Z' };
    const second = pageOf('SCRN-002', '/Orders', ['Deletes orders.']);
    const rejected: Card = {
      ...second,
      claims: second.claims.map((claim) => ({
        ...claim,
        status: 'Rejected',
        verdict: { ...verdict, step: 'judgement' as const },
      })),
    };
    const cards = [pageOf('SCRN-001', '/Orders', ['Lists orders.']), rejected];

    const merged = applyMerges(cards, pageMerges(cards), CARD_TYPES).cards[0];

    expect(merged?.claims.map((claim) => claim.status)).toEqual(['Supported', 'Rejected']);
    expect(merged?.claims[1]?.verdict?.reason).toBe('no');
  });
});

describe('P5-32 crossAreaMerges', () => {
  const card = (spec: Spec): Card => cardOf({ type: 'BR', title: 'Rounding', ...spec });

  it('two integration cards of one title for one mail server in two areas are one merge', () => {
    const cards = [
      card({
        ...{ id: 'INT-001', type: 'INT', title: 'Mail server' },
        claims: [['Sends via smtp://mail.example.test:25.', 'web/Mail.cs']],
      }),
      card({
        ...{ id: 'INT-002', type: 'INT', title: 'mail servers', area: 'jobs' },
        claims: [['Relays to smtp://mail.example.test:587.', 'jobs/Send.cs']],
      }),
    ];

    expect(idsOf(crossAreaMerges(cards))).toEqual([['INT-001', 'INT-002']]);
  });

  it('two open questions of one title citing the same file in two areas are one merge', () => {
    const cards = [
      card({ id: 'OQ-001', type: 'OQ', title: 'Who owns it?', claims: [['A.', 'x/Own.cs']] }),
      card({
        ...{ id: 'OQ-002', type: 'OQ', title: 'Who owns it', area: 'jobs' },
        claims: [['B.', 'x/Own.cs']],
      }),
    ];

    expect(idsOf(crossAreaMerges(cards))).toEqual([['OQ-001', 'OQ-002']]);
  });

  it('cards of one title about different files are kept apart', () => {
    const cards = [
      card({ id: 'BR-001', claims: [['A.', 'web/R.cs']] }),
      card({ id: 'BR-002', area: 'jobs', claims: [['B.', 'jobs/R.cs']] }),
    ];

    expect(crossAreaMerges(cards)).toEqual([]);
  });
});

describe('P5-32 crossAreaMerges, systems and exclusions', () => {
  const card = (spec: Spec): Card => cardOf({ type: 'BR', title: 'Rounding', ...spec });

  it('cards of one title that name one external host are one merge', () => {
    const cards = [
      card({ id: 'BR-001', claims: [['Calls https://rates.example.test/v1.', 'web/R.cs']] }),
      card({
        ...{ id: 'BR-002', area: 'jobs' },
        claims: [['Reads https://rates.example.test/v2 daily.', 'jobs/R.cs']],
      }),
    ];

    expect(idsOf(crossAreaMerges(cards))).toEqual([['BR-001', 'BR-002']]);
  });

  it('flows are never merged here', () => {
    const cards = [
      card({ id: 'FLOW-001', type: 'FLOW', claims: [['A.', 'same.cs']] }),
      card({ id: 'FLOW-002', type: 'FLOW', area: 'jobs', claims: [['B.', 'same.cs']] }),
    ];

    expect(crossAreaMerges(cards)).toEqual([]);
  });

  it('cards of one area only are left to the title merge', () => {
    const cards = [
      card({ id: 'BR-001', claims: [['A.', 'same.cs']] }),
      card({ id: 'BR-002', claims: [['B.', 'same.cs']] }),
    ];

    expect(crossAreaMerges(cards)).toEqual([]);
  });
});

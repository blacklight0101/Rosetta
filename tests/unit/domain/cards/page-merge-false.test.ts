import { describe, expect, it } from 'vitest';
import { applyMerges } from '../../../../src/domain/cards/card-merge.js';
import { CARD_TYPES, type CardType } from '../../../../src/domain/cards/card-vocabulary.js';
import type { Card } from '../../../../src/domain/cards/card.js';
import { crossAreaMerges, pageMerges } from '../../../../src/domain/cards/page-merge.js';

// P5-32 round 2: a false merge is worse than a leftover duplicate. Evidence must be a shared file
// or a real external host; shared layouts, local hosts, secrets and code namespaces are not.

interface Spec {
  readonly id: string;
  readonly type?: CardType;
  readonly area?: string;
  readonly route?: string;
  readonly claims: readonly (readonly [string, string])[];
}

function cardOf(spec: Spec): Card {
  const { id, type = 'BR', area = 'web', claims } = spec;
  return {
    ...{ id, type, title: 'Same title', summary: 's', area, agentTaskId: `t-${id}` },
    confidence: 'High',
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

const pair = (first: string, second: string, type: CardType = 'BR'): Card[] => [
  cardOf({ id: `${type}-001`, type, claims: [[first, 'web/A.cs']] }),
  cardOf({ id: `${type}-002`, type, area: 'jobs', claims: [[second, 'jobs/B.cs']] }),
];

const masked = 'Opens https://admin:[MASKED:password]@db.corp/';

describe('P5-32 cross-area merges need real evidence', () => {
  it('integration cards of one generic title about different files and hosts stay apart', () => {
    const cards = pair('Uses Postgres.', 'Uses MongoDB.', 'INT');

    expect(crossAreaMerges(cards)).toEqual([]);
  });

  it('integration cards that cite one file are one merge', () => {
    const cards = [
      cardOf({ id: 'INT-001', type: 'INT', claims: [['A.', 'shared/Db.cs']] }),
      cardOf({ id: 'INT-002', type: 'INT', area: 'jobs', claims: [['B.', 'shared/Db.cs']] }),
    ];

    expect(crossAreaMerges(cards)).toHaveLength(1);
  });

  it.each([
    ['localhost ports', 'Calls http://localhost:5000/x.', 'Calls http://localhost:8080/y.'],
    ['one localhost port', 'Calls http://localhost:5000/x.', 'Calls http://localhost:5000/y.'],
    ['loopback', 'Calls http://127.0.0.1/a.', 'Calls http://127.0.0.1/b.'],
    ['private addresses', 'Calls http://10.0.0.5/a.', 'Calls http://10.0.0.5/b.'],
    ['private 192.168', 'Calls http://192.168.1.2/a.', 'Calls http://192.168.1.2/b.'],
    ['a code namespace', 'Uses Acme.Billing.Net here.', 'Uses Acme.Billing.Net there.'],
    ['a bare dotted name', 'Reads rates.example.test daily.', 'Reads rates.example.test too.'],
    ['masked credentials', masked, masked],
    [
      'starred credentials',
      'Opens https://admin:****@db.corp/',
      'Opens https://admin:****@db.corp/',
    ],
  ])('%s are no evidence of one system', (_what, first, second) => {
    expect(crossAreaMerges(pair(first, second))).toEqual([]);
  });

  it('the user name of a URL is never read as its host', () => {
    const cards = pair(
      'Opens https://admin:pw@db1.example.test/',
      'Opens https://admin:pw@db2.example.test/',
    );

    expect(crossAreaMerges(cards)).toEqual([]);
  });

  it('the same real host merges whatever the user info and path', () => {
    const cards = pair('Opens https://a:b@db1.example.test/x', 'Opens https://db1.example.test/y');

    expect(crossAreaMerges(cards)).toHaveLength(1);
  });
});

const screen = (id: string, files: readonly string[], route?: string): Card =>
  cardOf({
    id,
    type: 'SCRN',
    ...(route === undefined ? {} : { route }),
    claims: files.map((file, index) => [`Claim ${String(index)}.`, file] as const),
  });

const layout = 'Shared/_Layout.cshtml';

describe('P5-32 page merge never joins through a shared layout', () => {
  it('two routeless cards sharing only a layout stay apart', () => {
    const cards = [
      screen('SCRN-001', [layout, layout, 'Pages/A.cshtml']),
      screen('SCRN-002', [layout, layout, 'Pages/B.cshtml']),
    ];

    expect(pageMerges(cards)).toEqual([]);
  });

  it('a routeless card and a routed card sharing only a layout stay apart', () => {
    const cards = [
      screen('SCRN-001', [layout, 'Pages/A.cshtml'], '/A'),
      screen('SCRN-002', [layout, layout, 'Pages/B.cshtml']),
    ];

    expect(pageMerges(cards)).toEqual([]);
  });

  it('a file cited by pages of two routes is no page identity', () => {
    const cards = [
      screen('SCRN-001', [layout, 'Pages/A.cshtml'], '/A'),
      screen('SCRN-002', [layout, 'Pages/B.cshtml'], '/B'),
      screen('SCRN-003', [layout]),
      screen('SCRN-004', [layout]),
    ];

    expect(pageMerges(cards)).toEqual([]);
  });

  it('a routeless card citing a helper of one page and not its page file stays apart', () => {
    const cards = [
      screen('SCRN-001', ['Pages/A.cshtml', 'Util/Format.cs'], '/A'),
      screen('SCRN-002', ['Util/Format.cs']),
    ];

    expect(pageMerges(cards)).toEqual([]);
  });

  it('markup and code of one page, cited in a different order, are one card', () => {
    const cards = [
      screen('SCRN-001', ['Pages/A.cshtml', 'Pages/A.cshtml', 'Pages/A.cshtml.cs']),
      screen('SCRN-002', ['Pages/A.cshtml.cs', 'Pages/A.cshtml.cs', 'Pages/A.cshtml']),
    ];

    const merged = applyMerges(cards, pageMerges(cards), CARD_TYPES);

    expect(merged.cards).toHaveLength(1);
  });
});

import { describe, expect, it } from 'vitest';
import type { CardType } from '../../../../src/domain/cards/card-vocabulary.js';
import type { Card } from '../../../../src/domain/cards/card.js';
import { crossAreaMerges, pageMerges } from '../../../../src/domain/cards/page-merge.js';

// P5-32 round 3: a file or host that many differently titled cards cite (a config file) is no
// evidence that two cards of one title are about one thing; a layout-only card decides no page.

interface Spec {
  readonly id: string;
  readonly type?: CardType;
  readonly title?: string;
  readonly area?: string;
  readonly route?: string;
  readonly claims: readonly (readonly [string, string])[];
}

function cardOf(spec: Spec): Card {
  const { id, type = 'BR', title = 'Timeout', area = 'web', claims } = spec;
  return {
    ...{ id, type, title, summary: 's', area, agentTaskId: `t-${id}`, confidence: 'High' },
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

const others = (path: string): Card[] =>
  ['Logging', 'Caching'].map((title, index) =>
    cardOf({ id: `FEAT-00${String(index + 1)}`, type: 'FEAT', title, claims: [['x.', path]] }),
  );

describe('P5-32 a widely cited file is no evidence', () => {
  it('two integration cards of one title citing a config that other cards cite stay apart', () => {
    const cards = [
      cardOf({
        id: 'INT-001',
        type: 'INT',
        title: 'Mail server',
        claims: [['SMTP.', 'web.config']],
      }),
      cardOf({
        ...{ id: 'INT-002', type: 'INT', title: 'Mail server', area: 'crm' },
        claims: [['Payment gateway.', 'web.config']],
      }),
      ...others('web.config'),
    ];

    expect(crossAreaMerges(cards)).toEqual([]);
  });

  it('two timeout rules citing one settings file that other cards cite stay apart', () => {
    const cards = [
      cardOf({ id: 'BR-001', claims: [['30 seconds.', 'appsettings.json']] }),
      cardOf({ id: 'BR-002', area: 'login', claims: [['5 seconds.', 'appsettings.json']] }),
      ...others('appsettings.json'),
    ];

    expect(crossAreaMerges(cards)).toEqual([]);
  });
});

describe('P5-32 a widely named host is no evidence', () => {
  it('a host that other cards name is no evidence either', () => {
    const named = (id: string, title: string, area: string): Card =>
      cardOf({
        id,
        title,
        area,
        claims: [['Calls https://api.example.test/v1.', `${area}/${id}.cs`]],
      });
    const cards = [
      named('BR-001', 'Timeout', 'web'),
      named('BR-002', 'Timeout', 'login'),
      named('BR-003', 'Retry', 'web'),
    ];

    expect(crossAreaMerges(cards)).toEqual([]);
  });

  it('a specific file cited by the two cards alone still merges them', () => {
    const cards = [
      cardOf({ id: 'BR-001', claims: [['30 seconds.', 'src/Billing/Timeout.cs']] }),
      cardOf({ id: 'BR-002', area: 'login', claims: [['Same.', 'src/Billing/Timeout.cs']] }),
      ...others('web.config'),
    ];

    expect(crossAreaMerges(cards).map((merge) => merge.ids)).toEqual([['BR-001', 'BR-002']]);
  });
});

const screen = (id: string, files: readonly string[]): Card =>
  cardOf({
    id,
    type: 'SCRN',
    title: id,
    claims: files.map((file, index) => [`Claim ${String(index)}.`, file] as const),
  });

describe('P5-32 a layout-only screen card decides no page', () => {
  const layout = 'Shared/_Layout.cshtml';

  it('a routeless card citing only a layout stays apart from one citing layout and page', () => {
    const cards = [
      screen('SCRN-001', [layout]),
      screen('SCRN-002', [layout, layout, 'Pages/A.cshtml']),
    ];

    expect(pageMerges(cards)).toEqual([]);
  });

  it('two routeless cards citing only the layout stay apart', () => {
    expect(pageMerges([screen('SCRN-001', [layout]), screen('SCRN-002', [layout])])).toEqual([]);
  });

  it('a routed card with a layout and a page does not take a layout-only card', () => {
    const routed = cardOf({
      ...{ id: 'SCRN-001', type: 'SCRN', title: 'A', route: '/A' },
      claims: [
        ['a.', layout],
        ['b.', 'Pages/A.cshtml'],
      ],
    });

    expect(pageMerges([routed, screen('SCRN-002', [layout])])).toEqual([]);
  });
});

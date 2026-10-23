import { describe, expect, it } from 'vitest';
import {
  applyMerges,
  disjointMerges,
  type CardMerge,
} from '../../../../src/domain/cards/card-merge.js';
import type { Card } from '../../../../src/domain/cards/card.js';
import { CARD_TYPES } from '../../../../src/domain/cards/card-vocabulary.js';
import { titleMerges } from '../../../../src/domain/cards/title-merge.js';

// P5-12, EV-42, RF-230, RF-250: a card joins at most one merge group; two screens with different
// routes never merge; flows merge only when they are the same journey. Synthetic cards.

function card(id: string, type: Card['type'], title: string, extra: Partial<Card> = {}): Card {
  return {
    ...{ id, type, title, summary: title, area: 'a', agentTaskId: `t-${id}` },
    confidence: 'High',
    claims: [
      {
        claimId: `${id}.c1`,
        text: `Claim of ${id}.`,
        citations: [{ path: 'a.md', startLine: 1, endLine: 1 }],
        status: 'Supported',
      },
    ],
    ...extra,
  };
}

function screen(id: string, title: string, route: string): Card {
  const detail = { route, roles: [], fields: [], actions: [], leadsTo: [] };
  return card(id, 'SCRN', title, { screen: detail });
}

const merge = (...ids: string[]): CardMerge => ({ ids, title: 'Merged', summary: 'Merged.' });

describe('P5-12 disjointMerges', () => {
  it('EV-42 a card named by five groups stays in the first one', () => {
    const merges = [
      merge('E-1', 'E-2'),
      merge('E-1', 'E-3'),
      merge('E-1', 'E-4'),
      merge('E-5', 'E-1'),
      merge('E-3', 'E-6'),
      merge('E-7', 'E-8'),
    ];

    expect(disjointMerges(merges).map((each) => each.ids)).toEqual([
      ['E-1', 'E-2'],
      ['E-3', 'E-6'],
      ['E-7', 'E-8'],
    ]);
  });

  it('P5-19 a later group that shares a card keeps its remaining cards when two or more are left', () => {
    const merges = [merge('E-1', 'E-2'), merge('E-1', 'E-3', 'E-4'), merge('E-5', 'E-6')];

    const result = disjointMerges(merges);

    expect(result.map((each) => each.ids)).toEqual([
      ['E-1', 'E-2'],
      ['E-3', 'E-4'],
      ['E-5', 'E-6'],
    ]);
    expect(result[1]).toMatchObject({ title: 'Merged', summary: 'Merged.' });
  });

  it('P5-19 a later group left with one card is dropped, and its card stays free for a third', () => {
    const merges = [merge('E-1', 'E-2'), merge('E-1', 'E-3'), merge('E-3', 'E-4')];

    expect(disjointMerges(merges).map((each) => each.ids)).toEqual([
      ['E-1', 'E-2'],
      ['E-3', 'E-4'],
    ]);
  });

  it('merges that share no card are all kept, in order', () => {
    const merges = [merge('E-1', 'E-2'), merge('E-3', 'E-4')];

    expect(disjointMerges(merges)).toEqual(merges);
  });
});

describe('P5-12 screens with different routes', () => {
  const start = screen('SCRN-001', 'Start', '/Default.aspx');
  const login = screen('SCRN-002', 'Login', '/Login.aspx');

  it('EV-42 a start page and a login page are not merged', () => {
    const result = applyMerges([start, login], [merge('SCRN-001', 'SCRN-002')]);

    expect(result.cards.map((each) => each.id)).toEqual(['SCRN-001', 'SCRN-002']);
    expect(result.skipped.map((each) => each.problem)).toEqual(['route-differs']);
  });

  it('screens of one route still merge, whatever the case, query or closing slash', () => {
    const again = screen('SCRN-003', 'Start page', '/default.aspx?x=1');

    const result = applyMerges([start, again], [merge('SCRN-001', 'SCRN-003')]);

    expect(result.cards.map((each) => each.id)).toEqual(['SCRN-001']);
  });

  it('the title merge does not group screens of two routes, and joins those of one', () => {
    const cards = [
      screen('SCRN-001', 'Main', '/Default.aspx'),
      screen('SCRN-002', 'Main', '/Login.aspx'),
      screen('SCRN-003', 'Main', '/Default.aspx'),
    ];

    expect(titleMerges(cards).map((each) => each.ids)).toEqual([['SCRN-001', 'SCRN-003']]);
    expect(applyMerges(cards, titleMerges(cards), CARD_TYPES).cards).toHaveLength(2);
  });
});

describe('P5-12 flows and integrations (open question, safe default)', () => {
  const flow = (id: string, trigger: string, step = 'Step.'): Card =>
    card(id, 'FLOW', 'Invoice Process', {
      flow: { trigger, outcome: 'Done.' },
      claims: [
        {
          claimId: `${id}.c1`,
          text: step,
          citations: [{ path: 'a.md', startLine: 1, endLine: 1 }],
          status: 'Supported',
        },
      ],
    });

  it('flows of one area with one title, trigger, outcome and steps are one flow', () => {
    const cards = [flow('FLOW-001', 'Click.'), flow('FLOW-002', 'click')];

    expect(titleMerges(cards).map((each) => each.ids)).toEqual([['FLOW-001', 'FLOW-002']]);
  });

  it('flows with one title but another trigger or other steps stay apart', () => {
    const cards = [
      flow('FLOW-001', 'Click.'),
      flow('FLOW-002', 'Import.'),
      flow('FLOW-003', 'Click.', 'Other step.'),
    ];

    expect(titleMerges(cards)).toEqual([]);
  });

  it('integrations merge on type, area and title like other cards', () => {
    const cards = [
      card('INT-001', 'INT', 'Payment Gateway'),
      card('INT-002', 'INT', 'payment gateways'),
    ];

    expect(titleMerges(cards).map((each) => each.ids)).toEqual([['INT-001', 'INT-002']]);
  });
});

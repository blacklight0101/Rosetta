import { describe, expect, it } from 'vitest';
import { applyMerges, foldRepeatedClaims } from '../../../../src/domain/cards/card-merge.js';
import { CARD_TYPES } from '../../../../src/domain/cards/card-vocabulary.js';
import type { Card } from '../../../../src/domain/cards/card.js';
import { normalisedTitle, titleMerges } from '../../../../src/domain/cards/title-merge.js';
import { claimCount, evalCards, supportedTexts } from '../../../support/p3-106-eval-cards.js';

// P3-106, RF-230, RF-250, EV-05: cards of one type whose titles match once case, punctuation and
// plurals are ignored are one card; every distinct claim stays.

function cardOf(id: string, type: Card['type'], title: string, texts: readonly string[]): Card {
  return {
    ...{ id, type, title, summary: title, area: 'a', agentTaskId: `t-${id}` },
    confidence: 'High',
    claims: texts.map((text, index) => ({
      claimId: `${id}.c${String(index + 1)}`,
      text,
      citations: [{ path: 'a.md', startLine: index + 1, endLine: index + 1 }],
      status: 'Supported',
    })),
  };
}

function mergedBy(cards: readonly Card[]): Card[] {
  return [...applyMerges(cards, titleMerges(cards), CARD_TYPES).cards];
}

/** What the consolidation step does without a model: the title merge, then the repeated claims. */
function consolidated(cards: readonly Card[]): readonly Card[] {
  return foldRepeatedClaims(mergedBy(cards)).cards;
}

describe('P3-106 normalisedTitle', () => {
  it('ignores case, punctuation, spacing and a plural s', () => {
    const same = [
      'Product Master Data Table',
      'product master data tables',
      'Product-Master  Data Table.',
    ];
    expect(new Set(same.map(normalisedTitle)).size).toBe(1);
  });

  it('keeps titles that differ in a word apart', () => {
    expect(normalisedTitle('Net Amount Calculation')).not.toBe(normalisedTitle('Net Amount'));
  });
});

describe('P3-106 titleMerges', () => {
  it('RF-230 two cards of one type with the same normalised title are one merge, first id first', () => {
    const cards = [
      cardOf('ENT-001', 'ENT', 'Product Master Data Table', ['One.']),
      cardOf('ENT-002', 'ENT', 'Workbook', ['Two.']),
      cardOf('ENT-003', 'ENT', 'product master data tables', ['Three.']),
    ];

    expect(titleMerges(cards)).toEqual([
      {
        ids: ['ENT-001', 'ENT-003'],
        title: 'Product Master Data Table',
        summary: 'Product Master Data Table',
      },
    ]);
  });

  it('RF-230 the same title in two types is not a merge', () => {
    const cards = [
      cardOf('ENT-001', 'ENT', 'Invoice', ['One.']),
      cardOf('BR-001', 'BR', 'Invoice', ['Two.']),
    ];

    expect(titleMerges(cards)).toEqual([]);
  });
});

describe('P3-106 titleMerges: open questions and flows', () => {
  it('RF-243 three open questions with one title become one card holding all three claims', () => {
    const cards = ['OQ-001', 'OQ-002', 'OQ-003'].map((id, index) => ({
      ...cardOf(id, 'OQ', 'Purpose of Asset Categorization', [`Claim ${String(index)}.`]),
      question: `Question ${String(index)}?`,
      whyItMatters: 'Why.',
      questionState: 'Open' as const,
    }));

    const merged = mergedBy(cards);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.id).toBe('OQ-001');
    expect(merged[0]?.questionState).toBe('Open');
    expect(merged[0]?.claims.map((claim) => claim.text)).toEqual([
      'Claim 0.',
      'Claim 1.',
      'Claim 2.',
    ]);
  });

  it('RF-230 flows with one title merge too: they describe the same journey twice', () => {
    const flow = { trigger: 't', outcome: 'o' };
    const cards = [
      { ...cardOf('FLOW-001', 'FLOW', 'Invoice Generation Process', ['Step.']), flow },
      { ...cardOf('FLOW-002', 'FLOW', 'Invoice Generation Process', ['Step two.']), flow },
    ];

    expect(mergedBy(cards).map((card) => card.id)).toEqual(['FLOW-001']);
  });
});

describe('P3-106 the evaluation card sets', () => {
  it.each([['asset-manager' as const], ['invoice' as const]])(
    'EV-05 %s: the card set shrinks and no distinct Supported claim is lost',
    async (run) => {
      const before = await evalCards(run);

      const after = consolidated(before);

      expect(after.length).toBeLessThan(before.length);
      expect(supportedTexts(after)).toEqual(supportedTexts(before));
      expect(claimCount(after)).toBeLessThan(claimCount(before));
      for (const card of after) {
        const texts = card.claims
          .filter((claim) => claim.status === 'Supported')
          .map((claim) => claim.text);
        expect(texts).toHaveLength(new Set(texts).size);
      }
    },
  );

  it('EV-05 Asset Manager: the five Product Master Data Table cards and the three open questions merge', async () => {
    const after = mergedBy(await evalCards('asset-manager'));

    const titles = after.map((card) => `${card.type} ${normalisedTitle(card.title)}`);
    expect(new Set(titles).size).toBe(titles.length);
    expect(after.filter((card) => card.type === 'OQ')).toHaveLength(3);
    expect(after.filter((card) => card.title === 'Product Master Data Table')).toHaveLength(1);
  });

  it('EV-05 Invoice: the six Invoice Generation Process flows are one', async () => {
    const after = mergedBy(await evalCards('invoice'));

    expect(after.filter((card) => card.title === 'Invoice Generation Process')).toHaveLength(1);
  });
});

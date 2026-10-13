import { describe, expect, it } from 'vitest';
import { claimTotals, parseCardIndex } from '../../../../src/application/report/report-model.js';
import { replayDemoText } from '../../../support/replay-fixture.js';

// RF-504: the cards of the report come from `cards/index.json`; a file that is missing, torn or of
// another version gives no cards, and a card whose path is not the card file layout gets no link.

const counts = { Proposed: 0, CitationInvalid: 0, Supported: 1, Rejected: 0, Unverified: 0 };

function indexOf(cards: readonly unknown[], schemaVersion = 1): string {
  return JSON.stringify({ schemaVersion, cards });
}

const card = {
  id: 'BR-001',
  type: 'BR',
  title: 'Free shipping',
  area: 'orders',
  path: 'cards/BR/BR-001.md',
  claimCounts: counts,
};

describe('parseCardIndex', () => {
  it('RF-504 reads the cards of the recorded run, in the order of the index', async () => {
    const cards = parseCardIndex(await replayDemoText('cards/index.json'));

    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ id: 'BR-001', type: 'BR', area: 'orders' });
    expect(cards[0]?.title).toContain('<script>');
    expect(cards[0]?.claimCounts).toEqual(counts);
  });

  it.each([
    ['no file', undefined],
    ['text that is not JSON', '{"cards": ['],
    ['an index of another version', indexOf([card], 2)],
    ['a card without a title', indexOf([{ ...card, title: undefined }])],
  ])('RF-504 gives no cards for %s', (_name, text) => {
    expect(parseCardIndex(text)).toEqual([]);
  });

  it.each([
    'cards/../../manifest.json',
    '../cards/BR/BR-001.md',
    '/etc/passwd',
    'cards/BR/BR-001.html',
    'javascript:alert(1)',
  ])('RF-504 leaves out a card whose path is %s', (path) => {
    expect(
      parseCardIndex(
        indexOf([
          { ...card, path },
          { ...card, id: 'BR-002' },
        ]),
      ),
    ).toHaveLength(2);
    expect(parseCardIndex(indexOf([{ ...card, path }]))[0]?.path).toBe('');
  });
});

describe('claimTotals', () => {
  it('RF-504 adds the claims of all cards per status, every status listed', () => {
    const other = { ...card, id: 'BR-002', claimCounts: { ...counts, Rejected: 2, Supported: 0 } };

    expect(claimTotals([card, other])).toEqual({
      Proposed: 0,
      CitationInvalid: 0,
      Supported: 1,
      Rejected: 2,
      Unverified: 0,
    });
  });
});

import { describe, expect, it } from 'vitest';
import { checkMerges } from '../../../../../src/application/lab/targets/merge-check.js';

// RF-1412: a merge answer is labelled by what it does to the ids and the text of its cards.

const titles = [
  'Catalog list page',
  'Catalog product list',
  'Order checkout form',
  'Basket totals',
  'Customer address',
  'Stock shipment',
];
const cards = titles.map((title, index) => ({ id: `SCRN-${String(index + 1)}`, title }));
const merge = (
  ids: string[],
  title = 'Catalog list',
  summary = 'The catalog product list page.',
) => ({
  ids,
  title,
  summary,
});

describe('the labels of a merge answer', () => {
  it('RF-1412 labels a valid merge Merges and an empty list NoMerge', () => {
    expect(checkMerges(cards, [merge(['SCRN-1', 'SCRN-2'])])).toBe('Merges');
    expect(checkMerges(cards, [])).toBe('NoMerge');
  });

  it('RF-1412 labels a merge of one id, an unlisted id or a repeated id Invalid', () => {
    expect(checkMerges(cards, [merge(['SCRN-1'])])).toBe('Invalid');
    expect(checkMerges(cards, [merge(['SCRN-1', 'SCRN-99'])])).toBe('Invalid');
    expect(checkMerges(cards, [merge(['SCRN-1', 'SCRN-1'])])).toBe('Invalid');
    expect(checkMerges(cards, [merge(['SCRN-1', 'SCRN-2']), merge(['SCRN-2', 'SCRN-3'])])).toBe(
      'Invalid',
    );
  });

  it('RF-1412 labels one merge of every card, or of more than half of them, Lumped', () => {
    const all = cards.map((card) => card.id);

    expect(checkMerges(cards, [merge(all)])).toBe('Lumped');
    expect(checkMerges(cards, [merge(all.slice(0, 4))])).toBe('Lumped');
    // Exactly half is not more than half.
    expect(
      checkMerges(cards, [merge(all.slice(0, 3), 'Catalog order basket', 'Catalog order basket')]),
    ).toBe('Merges');
  });

  it('RF-1412 labels a merged text that names only one of its cards Thin', () => {
    expect(checkMerges(cards, [merge(['SCRN-1', 'SCRN-3'], 'Catalog list', 'Catalog list')])).toBe(
      'Thin',
    );
    expect(checkMerges(cards, [merge(['SCRN-1', 'SCRN-2'], 'x', 'y')])).toBe('Thin');
  });

  it('RF-1412 does not call a small case Lumped', () => {
    const two = cards.slice(0, 2);

    expect(checkMerges(two, [merge(['SCRN-1', 'SCRN-2'])])).toBe('Merges');
  });
});

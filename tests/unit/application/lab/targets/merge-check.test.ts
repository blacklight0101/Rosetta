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
    // Exactly half is not more than half (the three cards share the word catalog).
    const related = cards.map((card, index) =>
      index < 3 ? { ...card, title: `Catalog ${card.title}` } : card,
    );
    expect(
      checkMerges(related, [
        merge(all.slice(0, 3), 'Catalog order basket', 'Catalog order basket'),
      ]),
    ).toBe('Merges');
  });

  it('RF-1412 labels a merged text that names only one of its cards Thin', () => {
    expect(checkMerges(cards, [merge(['SCRN-1', 'SCRN-2'], 'Page', 'Page')])).toBe('Thin');
    expect(checkMerges(cards, [merge(['SCRN-1', 'SCRN-2'], 'x', 'y')])).toBe('Thin');
  });
});

describe('the relatedness of a merge', () => {
  it('RF-1412 labels the first and the last card under a title naming one word of each Unrelated', () => {
    const probe = merge(['SCRN-1', 'SCRN-6'], 'Catalog stock', 'Catalog list and stock shipment.');

    expect(checkMerges(cards, [probe])).toBe('Unrelated');
    expect(
      checkMerges(cards, [merge(['SCRN-1', 'SCRN-3'], 'Catalog order', 'Catalog order')]),
    ).toBe('Unrelated');
  });

  it('RF-1412 keeps a merge whose cards are linked through a third card', () => {
    const chain = [
      { id: 'A', title: 'Catalog list' },
      { id: 'B', title: 'Catalog stock' },
      { id: 'C', title: 'Stock shipment' },
      { id: 'D', title: 'Unrelated thing' },
    ];

    expect(
      checkMerges(chain, [
        merge(['A', 'B', 'C'], 'Catalog stock list shipment', 'Catalog stock list shipment'),
      ]),
    ).toBe('Merges');
  });

  it('RF-1412 does not call a small case Lumped', () => {
    const two = cards.slice(0, 2);

    expect(checkMerges(two, [merge(['SCRN-1', 'SCRN-2'])])).toBe('Merges');
  });
});

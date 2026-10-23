import { describe, expect, it } from 'vitest';
import { deepen, lines, parent } from '../../../support/restated-fixtures.js';

// P3-125 fix round 3, HB-06: folding is conservative. The identifiers must come in the same order
// (the first one is the subject), and a capitalised word that is not the start of a sentence and
// differs between two claims is a name: those claims are not folded.

const [damaged, usable, repair] = ['Txt_QtyDamaged', 'Txt_QtyUsable', 'Txt_QtyRepair'] as const;
const listed = (lead: string) =>
  `Field ${lead} (text, optional) validation: At least one of ${damaged}, ${usable} or ${repair} must be filled.`;

describe('HB-06 the identifiers come in the same order', () => {
  it('P3-125 three "at least one of" claims with one shared list and different leading fields', () => {
    const card = parent([[listed(damaged), 'Supported', lines(1, 9)]]);

    const byUsable = deepen(card, [{ text: listed(usable), citations: lines(2, 5) }]);
    const byRepair = deepen(card, [{ text: listed(repair), citations: lines(2, 5) }]);

    expect(byUsable.claims).toHaveLength(1);
    expect(byRepair.claims).toHaveLength(1);
  });

  it('P3-125 the same set of lowercase identifiers in another order is another claim', () => {
    const text = (lead: string) =>
      `field ${lead} (text, optional) validation: at least one of qty_damaged, qty_usable or qty_repair must be filled.`;
    const card = parent([[text('qty_damaged'), 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: text('qty_repair'), citations: lines(1, 9) }]);

    expect(out.claims).toHaveLength(1);
  });
});

describe('HB-06 a capitalised word that differs is a name', () => {
  it('P3-125 "Column Name" and "Column Price" stay apart', () => {
    const text = (name: string) => `Column ${name} holds the product name of the row.`;
    const card = parent([[text('Name'), 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: text('Price'), citations: lines(1, 9) }]);

    expect(out.claims).toHaveLength(1);
  });

  it('P3-125 "Field Email" and "Field Phone" stay apart in a sentence of nine words or more', () => {
    const text = (name: string) =>
      `Field ${name} (text, optional) is on the screen of the customer form.`;
    const card = parent([[text('Email'), 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: text('Phone'), citations: lines(1, 9) }]);

    expect(out.claims).toHaveLength(1);
  });

  it('P3-125 a capitalised first word of a sentence is no name: the claims fold', () => {
    const tail = 'the limit of the customer account when the customer places a new order online';
    const card = parent([[`Orders cannot exceed ${tail}.`, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: `Totals cannot exceed ${tail}.`, citations: lines(1, 9) }]);

    expect(out.claims).toEqual([]);
  });

  it('P3-125 pure lowercase rewording still folds', () => {
    const tail = 'the limit of the customer account when the customer places a new order online';
    const card = parent([[`the total cannot exceed ${tail}.`, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [
      { text: `the total may not exceed ${tail}.`, citations: lines(1, 9) },
    ]);

    expect(out.claims).toEqual([]);
  });
});

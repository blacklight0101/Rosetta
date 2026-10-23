import { describe, expect, it } from 'vitest';
import { deepen, lines, parent } from '../../../support/restated-fixtures.js';

// P3-125 fix round 2, HB-06: claims whose words are almost the same but that name different identifiers
// (a field, a column, a class) say different things and are not folded. Only wording may differ.

describe('HB-06 claims that differ only in an identifier stay apart', () => {
  it('P3-125 two field claims on the same lines that differ in the field name', () => {
    const damaged = 'Field Txt_QtyDamaged (text, optional) is on the screen.';
    const card = parent([[damaged, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [
      { text: damaged.replace('Txt_QtyDamaged', 'Txt_QtyRepair'), citations: lines(1, 9) },
    ]);

    expect(out.claims).toHaveLength(1);
    expect(out.replaced).toEqual([]);
  });

  it('P3-125 two "at least one of A, B must be filled" claims that name different fields', () => {
    const text = 'At least one of Txt_QtyDamaged, Txt_QtyRepair must be filled.';
    const card = parent([[text, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [
      { text: text.replace('Txt_QtyRepair', 'Txt_QtyScrap'), citations: lines(1, 9) },
    ]);

    expect(out.claims).toHaveLength(1);
  });
});

describe('HB-06 what counts as an identifier, and what is only wording', () => {
  it.each([
    ['a camel-case name', 'qtyDamaged', 'qtyRepair'],
    ['a dotted name', 'Order.Total', 'Order.Tax'],
    ['a name with digits', 'Col1', 'Col2'],
    ['a quoted name', '`damaged`', '`repair`'],
    ['a namespaced name', 'Orders::Total', 'Orders::Tax'],
  ])('P3-125 %s counts as an identifier', (_name, one, two) => {
    const text = `The screen shows ${one} in the grid of the page for each row.`;
    const card = parent([[text, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: text.replace(one, two), citations: lines(1, 9) }]);

    expect(out.claims).toHaveLength(1);
  });

  it('P3-125 "cannot exceed" and "may not exceed" with the same identifiers are one claim', () => {
    const tail = 'the limit of the customer account when the customer places a new order online';
    const card = parent([[`Order.Total cannot exceed ${tail}.`, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [
      { text: `Order.Total may not exceed ${tail}.`, citations: lines(1, 9) },
    ]);

    expect(out.claims).toEqual([]);
    expect(out.replaced).toHaveLength(1);
  });
});

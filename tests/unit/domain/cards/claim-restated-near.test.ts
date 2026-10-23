import { describe, expect, it } from 'vitest';
import { deepen, lines, parent } from '../../../support/restated-fixtures.js';

// P3-125 fix round 1, RF-300, RF-209, HB-06: a citation folded into a claim passes the same file and
// line-range check as any citation, and two claims are also the same when their words are almost the
// same (Jaccard 0.8), they cite a line in common, and they agree on negation and on every number.

const file = 'src/Orders/Order.cs';
const known = new Map([[file, 100]]);
const total = 'An order has a total.';
const near = 'An order has a total amount.';

describe('RF-300 the citations a folded claim brings', () => {
  it('P3-125 drops a citation of a file the code map does not have, and counts it', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);
    const missing = { path: 'src/Gone.cs', startLine: 1, endLine: 3 };

    const out = deepen(card, [{ text: total, citations: [...lines(5, 12), missing] }], [], known);

    expect(out.cards[0]?.claims[0]?.citations).toEqual([...lines(1, 9), ...lines(5, 12)]);
    expect(out.replaced).toEqual([
      { agentTaskId: 'reader-003', claimId: 'ENT-001.c1', kind: 'folded', citationsDropped: 1 },
    ]);
  });

  it('P3-125 drops a range past the end of the file', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);

    const out = deepen(
      card,
      [{ text: total, citations: [...lines(5, 12), ...lines(90, 200)] }],
      [],
      known,
    );

    expect(out.cards[0]?.claims[0]?.citations).toEqual([...lines(1, 9), ...lines(5, 12)]);
    expect(out.replaced[0]).toMatchObject({ citationsDropped: 1 });
  });

  it('P3-125 a claim whose only overlapping citation is invalid is no repeat: it is added for the check', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: total, citations: lines(5, 200) }], [], known);

    expect(out.claims).toEqual([{ claimId: 'ENT-001.c2', agentTaskId: 'reader-003' }]);
    expect(out.cards[0]?.claims[1]?.citations).toEqual(lines(5, 200));
    expect(out.replaced).toEqual([]);
  });
});

describe('HB-06 near-duplicate claims', () => {
  it('P3-125 folds a claim whose words are almost the same and that cites a line in common', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: near, citations: lines(8, 12) }]);

    expect(out.claims).toEqual([]);
    expect(out.cards[0]?.claims[0]?.citations).toEqual([...lines(1, 9), ...lines(8, 12)]);
  });

  it('P3-125 keeps a near-duplicate that cites other lines', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);

    expect(deepen(card, [{ text: near, citations: lines(40, 44) }]).claims).toHaveLength(1);
  });

  it('P3-125 keeps a claim with less in common than 0.8', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);
    const other = 'An order has a delivery date.';

    expect(deepen(card, [{ text: other, citations: lines(1, 9) }]).claims).toHaveLength(1);
  });
});

describe('HB-06 near-duplicate claims that differ in what they say', () => {
  it('P3-125 "X is required" and "X is not required" stay apart', () => {
    const card = parent([['The customer field is required.', 'Supported', lines(1, 9)]]);

    const out = deepen(card, [
      { text: 'The customer field is not required.', citations: lines(1, 9) },
    ]);

    expect(out.claims).toHaveLength(1);
  });

  it('P3-125 two claims that both negate are the same', () => {
    const card = parent([['The customer field is not required.', 'Supported', lines(1, 9)]]);

    const out = deepen(card, [
      { text: 'The customer field is not always required.', citations: lines(1, 9) },
    ]);

    expect(out.claims).toEqual([]);
  });

  it('P3-125 a limit of 5 and a limit of 6 stay apart', () => {
    const five = 'An order holds at most 5 line items in total.';
    const card = parent([[five, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: five.replace('5', '6'), citations: lines(1, 9) }]);

    expect(out.claims).toHaveLength(1);
  });

  it('P3-125 a near restatement of a rejected claim with a new citation replaces it', () => {
    const card = parent([[total, 'Rejected', lines(1, 9)]]);

    const out = deepen(card, [{ text: near, citations: lines(40, 44) }]);

    expect(out.cards[0]?.claims[1]).toMatchObject({ replaces: 'ENT-001.c1' });
  });
});

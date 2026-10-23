import { describe, expect, it } from 'vitest';
import type { ClaimStatus } from '../../../../src/domain/cards/card-vocabulary.js';
import { deepen, lines, parent, verdict } from '../../../support/restated-fixtures.js';

// P3-125, RF-209, RF-302, DEC-19, HB-06: a Deepen claim on a card that already holds the same thing
// (same words once case and punctuation are ignored, a cited line in common) is not added again; a
// rejected claim stays and the restatement with a new citation is the claim that replaces it.

const total = 'An order has a total.';
const text = 'An order has a customer.';
const folded = (claimId: string) => ({
  agentTaskId: 'reader-003',
  claimId,
  kind: 'folded',
  citationsDropped: 0,
});
const rejected = (claimId: string) => ({
  agentTaskId: 'reader-003',
  claimId,
  kind: 'rejected',
  citationsDropped: 0,
});

describe('P3-125 a claim the card already holds', () => {
  it('HB-06 is not added again: same words, other case and punctuation, a line in common', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: '  an ORDER has a total  ', citations: lines(5, 12) }]);

    expect(out.claims).toEqual([]);
    expect(out.cards[0]?.claims).toHaveLength(1);
    expect(out.replaced).toEqual([folded('ENT-001.c1')]);
  });

  it('HB-06 keeps the verdict of the claim and gives it both citations', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: total, citations: lines(5, 12) }]);

    const [claim] = out.cards[0]?.claims ?? [];
    expect(claim).toMatchObject({ claimId: 'ENT-001.c1', status: 'Supported', verdict });
    expect(claim?.citations).toEqual([...lines(1, 9), ...lines(5, 12)]);
  });

  it.each<ClaimStatus>(['Proposed', 'Unverified'])('HB-06 folds into a %s claim too', (status) => {
    const card = parent([[total, status, lines(1, 9)]]);

    const out = deepen(card, [{ text: total, citations: lines(9, 9) }]);

    expect(out.claims).toEqual([]);
    expect(out.cards[0]?.claims[0]?.status).toBe(status);
  });

  it('HB-06 a CitationInvalid claim is not an answer: the new claim is added', () => {
    const card = parent([[total, 'CitationInvalid', lines(1, 9)]]);

    const out = deepen(card, [{ text: total, citations: lines(1, 9) }]);

    expect(out.claims).toEqual([{ claimId: 'ENT-001.c2', agentTaskId: 'reader-003' }]);
    expect(out.replaced).toEqual([]);
  });
});

describe('P3-125 a claim with other lines or words than the card holds', () => {
  it('HB-06 the same words on other lines of the file are new evidence and are added', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: total, citations: lines(40, 44) }]);

    expect(out.claims).toHaveLength(1);
  });

  it('HB-06 the same lines in another file are not an overlap', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);
    const other = [{ path: 'src/Orders/Other.cs', startLine: 1, endLine: 9 }];

    expect(deepen(card, [{ text: total, citations: other }]).claims).toHaveLength(1);
  });

  it('HB-06 other words on the same lines are a distinct claim and are added', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);

    const out = deepen(card, [{ text: 'An order has a delivery date.', citations: lines(1, 9) }]);

    expect(out.cards[0]?.claims.map((claim) => claim.claimId)).toEqual([
      'ENT-001.c1',
      'ENT-001.c2',
    ]);
  });

  it('HB-06 a text with no letter or digit is never taken for a repeat', () => {
    const card = parent([['...', 'Supported', lines(1, 9)]]);

    expect(deepen(card, [{ text: '--', citations: lines(1, 9) }]).claims).toHaveLength(1);
  });
});

describe('P3-125 claims written twice', () => {
  it('HB-06 a claim written twice in one task is added once, with both citations', () => {
    const card = parent([[total, 'Supported', lines(1, 9)]]);
    const fact = 'An order has a delivery date.';

    const out = deepen(card, [
      { text: fact, citations: lines(20, 24) },
      { text: fact.toUpperCase(), citations: lines(24, 30) },
    ]);

    expect(out.claims).toEqual([{ claimId: 'ENT-001.c2', agentTaskId: 'reader-003' }]);
    expect(out.cards[0]?.claims[1]?.citations).toEqual([...lines(20, 24), ...lines(24, 30)]);
  });
});

describe('P3-125 a round with a repeat and new claims', () => {
  it('HB-06 keeps every distinct claim of a round and drops only the repeat', () => {
    const card = parent([
      [total, 'Supported', lines(1, 9)],
      ['An order has a customer.', 'Supported', lines(10, 12)],
    ]);

    const out = deepen(card, [
      { text: total, citations: lines(2, 3) },
      { text: 'An order has a status.', citations: lines(13, 14) },
      { text: 'An order has a note.', citations: lines(15, 16) },
    ]);

    expect(out.cards[0]?.claims.map((claim) => claim.claimId)).toEqual([
      'ENT-001.c1',
      'ENT-001.c2',
      'ENT-001.c3',
      'ENT-001.c4',
    ]);
    expect(out.claims.map((claim) => claim.claimId)).toEqual(['ENT-001.c3', 'ENT-001.c4']);
  });

  it('HB-06 a repeat that names the claim it replaces hands that to the claim that stands', () => {
    const card = parent([
      ['An order has a customer.', 'Rejected', lines(10, 12)],
      [total, 'Supported', lines(1, 9)],
    ]);

    const out = deepen(
      card,
      [{ text: total, citations: lines(1, 9), replaces: 'ENT-001.c1' }],
      ['ENT-001.c1'],
    );

    expect(out.cards[0]?.claims[1]).toMatchObject({
      claimId: 'ENT-001.c2',
      replaces: 'ENT-001.c1',
    });
  });
});

describe('P3-125 a rejected claim the Deepen states again', () => {
  it('DEC-19 with a new citation: added as the claim that replaces it, the rejected claim is kept', () => {
    const card = parent([[text, 'Rejected', lines(10, 12)]]);

    const out = deepen(card, [{ text: text.toLowerCase(), citations: lines(30, 33) }]);

    const claims = out.cards[0]?.claims ?? [];
    expect(claims.map((claim) => [claim.claimId, claim.status, claim.replaces])).toEqual([
      ['ENT-001.c1', 'Rejected', undefined],
      ['ENT-001.c2', 'Proposed', 'ENT-001.c1'],
    ]);
    expect(claims[0]).toMatchObject({ verdict, citations: lines(10, 12) });
    expect(out.claims).toEqual([{ claimId: 'ENT-001.c2', agentTaskId: 'reader-003' }]);
    expect(out.replaced).toEqual([rejected('ENT-001.c1')]);
  });
});

describe('P3-125 a rejected claim that is stated again, more cases', () => {
  it('DEC-19 with the lines it was rejected for: nothing new, the rejected claim stays alone', () => {
    const card = parent([[text, 'Rejected', lines(10, 12)]]);

    const out = deepen(card, [{ text, citations: lines(11, 11) }]);

    expect(out.claims).toEqual([]);
    expect(out.cards[0]?.claims).toHaveLength(1);
    expect(out.cards[0]?.claims[0]?.status).toBe('Rejected');
    expect(out.replaced).toEqual([rejected('ENT-001.c1')]);
  });

  it('DEC-19 a claim that names another rejected claim keeps what the reader wrote', () => {
    const card = parent([
      [text, 'Rejected', lines(10, 12)],
      ['An order has a status.', 'Rejected', lines(1, 2)],
    ]);

    const out = deepen(
      card,
      [{ text, citations: lines(30, 33), replaces: 'ENT-001.c2' }],
      ['ENT-001.c2'],
    );

    expect(out.cards[0]?.claims[2]?.replaces).toBe('ENT-001.c2');
  });

  it('DEC-19 a rejected claim that a claim already replaces is not replaced again by the restatement', () => {
    const card = parent([
      [text, 'Rejected', lines(10, 12)],
      ['An order has a customer id.', 'Supported', lines(30, 33)],
    ]);
    const answered = {
      ...card,
      claims: card.claims.map((claim, index) =>
        index === 1 ? { ...claim, replaces: 'ENT-001.c1' } : claim,
      ),
    };

    const out = deepen(answered, [{ text, citations: lines(50, 52) }]);

    expect(out.cards[0]?.claims[2]).not.toHaveProperty('replaces');
    expect(out.replaced).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { checkCitations } from '../../../../src/application/verifier/citation-check.js';
import { assignCardIds } from '../../../../src/domain/cards/card-ids.js';
import type { Card } from '../../../../src/domain/cards/card.js';
import type { Citation } from '../../../../src/domain/cards/citation.js';
import { draftOf } from '../../../support/card-fixtures.js';
import { entry, unhashed } from '../../../support/code-map-builders.js';

// RF-300, RF-302, ADR-005: step 1 of the verifier checks every citation against the code map.

const at = '2026-10-12T10:00:00.000Z';

/** Files of the code map with their line counts. */
const codeMap = {
  files: [
    entry('src/Orders/Checkout.cs', 10, { lines: 40 }),
    entry('src/Orders/Order.cs', 10, { lines: 12 }),
    unhashed('src/big.sql', 0, { lines: 0, skipped: 'too-large' }),
  ],
};

function cardsCiting(...claims: (readonly Citation[])[]): readonly Card[] {
  const draft = draftOf({
    claims: claims.map((citations, index) => ({ text: `Claim ${String(index)}`, citations })),
  });
  const cards = assignCardIds([{ agentTaskId: 'reader-001', area: 'orders', drafts: [draft] }]);
  if (!cards.ok) throw new Error('fixture cards are invalid');
  return cards.value;
}

const cite = (path: string, startLine: number, endLine: number): Citation => ({
  path,
  startLine,
  endLine,
});

describe('citation check (step 1)', () => {
  it('RF-300 a claim whose citations lie inside listed files stays Proposed', () => {
    const cards = cardsCiting([
      cite('src/Orders/Checkout.cs', 1, 40),
      cite('src/Orders/Order.cs', 3, 3),
    ]);

    const checked = checkCitations(cards, codeMap, at);

    expect(checked.cards[0]?.claims[0]).toMatchObject({ status: 'Proposed' });
    expect(checked.cards[0]?.claims[0]?.verdict).toBeUndefined();
    expect(checked.checks).toEqual([{ claimId: 'FEAT-001.c1', ok: true }]);
  });

  it('RF-300 a citation of a file the code map does not list makes the claim CitationInvalid with the reason', () => {
    const cards = cardsCiting([cite('src/Orders/Missing.cs', 1, 2)]);

    const checked = checkCitations(cards, codeMap, at);

    const claim = checked.cards[0]?.claims[0];
    expect(claim?.status).toBe('CitationInvalid');
    expect(claim?.verdict).toEqual({
      step: 'citation',
      reason: 'src/Orders/Missing.cs is not a file of the code map.',
      model: 'citation-check',
      at,
    });
    expect(checked.checks).toEqual([
      { claimId: 'FEAT-001.c1', ok: false, reason: claim?.verdict?.reason },
    ]);
  });
});

describe('citation check (step 1): line ranges', () => {
  it('RF-300 a range that ends after the last line of the file makes the claim CitationInvalid', () => {
    const cards = cardsCiting([cite('src/Orders/Order.cs', 10, 13)]);

    const checked = checkCitations(cards, codeMap, at);

    expect(checked.cards[0]?.claims[0]).toMatchObject({
      status: 'CitationInvalid',
      verdict: {
        reason: 'src/Orders/Order.cs:10-13 ends after the last line of the file (12).',
      },
    });
  });

  it('RF-300 a citation of a file the scan skipped is invalid, and one bad citation is enough', () => {
    const cards = cardsCiting([cite('src/Orders/Order.cs', 1, 2), cite('src/big.sql', 1, 1)]);

    const checked = checkCitations(cards, codeMap, at);

    expect(checked.cards[0]?.claims[0]).toMatchObject({
      status: 'CitationInvalid',
      verdict: { reason: 'src/big.sql:1-1 ends after the last line of the file (0).' },
    });
  });
});

describe('citation check (step 1): claims are kept', () => {
  it('RF-302 an invalid claim is kept in its card, next to the valid ones, with its text and citations', () => {
    const cards = cardsCiting(
      [cite('src/Orders/Order.cs', 1, 2)],
      [cite('src/Orders/Gone.cs', 1, 2)],
      [cite('src/Orders/Checkout.cs', 5, 6)],
    );

    const checked = checkCitations(cards, codeMap, at);

    const claims = checked.cards[0]?.claims ?? [];
    expect(claims.map((claim) => [claim.claimId, claim.status])).toEqual([
      ['FEAT-001.c1', 'Proposed'],
      ['FEAT-001.c2', 'CitationInvalid'],
      ['FEAT-001.c3', 'Proposed'],
    ]);
    expect(claims[1]).toMatchObject({
      text: 'Claim 1',
      citations: [cite('src/Orders/Gone.cs', 1, 2)],
    });
    expect(checked.checks.map((check) => check.ok)).toEqual([true, false, true]);
  });

  it('RF-300 a path is compared exactly: another letter case is not the listed file', () => {
    const cards = cardsCiting([cite('src/orders/order.cs', 1, 2)]);

    const checked = checkCitations(cards, codeMap, at);

    expect(checked.cards[0]?.claims[0]?.status).toBe('CitationInvalid');
  });
});

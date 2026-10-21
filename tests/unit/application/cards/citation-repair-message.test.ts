import { describe, expect, it } from 'vitest';
import { parseCardsLenient } from '../../../../src/application/cards/parse-cards.js';
import { cardObject } from '../../../support/card-output.js';

// RF-202 (Q-47): a claim dropped for its citation is listed with the citation the model wrote and
// the form it should have written, so the repair attempt can fix it.

function answerWith(citation: string): string {
  const claims = [{ text: 'It adds interest.', citations: [citation] }];
  return JSON.stringify({ cards: [cardObject({ claims })] });
}

describe('the problem of a dropped citation', () => {
  it('RF-202 names the citation that was written and the expected form', () => {
    const written = 'Loan.xlsx/Sheet1/values.md:R2 | C2 0.05';

    const parsed = parseCardsLenient(answerWith(written));

    expect(parsed.problems).toHaveLength(1);
    const problem = parsed.problems[0];
    expect(problem?.path).toBe('cards.0.claims.0.citations.0');
    expect(problem?.message).toContain(written);
    expect(problem?.message).toContain('path/to/file.ext:startLine-endLine');
    expect(problem?.message).toContain('line numbers');
  });

  it('RF-202 a row label is named too', () => {
    const parsed = parseCardsLenient(answerWith('Loan.xlsx/Sheet1/values.md:R8'));

    expect(parsed.problems[0]?.message).toContain('values.md:R8');
  });

  it('RF-202 a very long citation is cut in the message', () => {
    const written = `values.md:${'x'.repeat(400)}`;

    const parsed = parseCardsLenient(answerWith(written));

    const message = parsed.problems[0]?.message ?? '';
    expect(message).toContain('values.md:xxx');
    expect(message.length).toBeLessThan(400);
  });
});

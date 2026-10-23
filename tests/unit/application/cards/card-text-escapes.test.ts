import { describe, expect, it } from 'vitest';
import { parseCardsLenient } from '../../../../src/application/cards/parse-cards.js';
import { cardObject } from '../../../support/card-output.js';

// P5-09 (EV-33): a model that double-escapes its JSON leaves literal escape sequences in the text
// it wrote, such as \u005b for "[". The card text normaliser decodes \uXXXX (and literal \n and
// \t) before storing, never into HTML or other control characters, and never in a citation.

function answerWithClaim(text: string, citations: string[] = ['src/Orders/Checkout.cs:10-24']) {
  return JSON.stringify({ cards: [cardObject({ claims: [{ text, citations }] })] });
}

function claimTexts(raw: string): string[] {
  return parseCardsLenient(raw).drafts.flatMap((draft) => draft.claims.map((claim) => claim.text));
}

describe('card text decodes literal escape sequences (P5-09)', () => {
  it('EV-33 a recorded claim with \\u005b and \\u005d reads with brackets', () => {
    const raw = answerWithClaim('It tags the order \\u005bdraft\\u005d before saving.');

    expect(claimTexts(raw)).toEqual(['It tags the order [draft] before saving.']);
  });

  it('EV-33 the same escapes in a card title and summary are decoded too', () => {
    const raw = JSON.stringify({
      cards: [
        cardObject({
          title: 'Order \\u005bcheckout\\u005d',
          summary: 'Turns a basket \\u005binto\\u005d an order.',
        }),
      ],
    });
    const [draft] = parseCardsLenient(raw).drafts;

    expect(draft?.title).toBe('Order [checkout]');
    expect(draft?.summary).toBe('Turns a basket [into] an order.');
  });

  it('EV-33 a literal \\n between sentences becomes a newline', () => {
    expect(claimTexts(answerWithClaim('First sentence.\\nSecond sentence.'))).toEqual([
      'First sentence.\nSecond sentence.',
    ]);
  });

  it('EV-33 an escape that would add HTML or a control character stays as written', () => {
    const written = 'Keeps \\u003cb\\u003e, \\u0026 and \\u0007 as written.';

    expect(claimTexts(answerWithClaim(written))).toEqual([
      'Keeps \\u003cb\\u003e, \\u0026 and \\u0007 as written.',
    ]);
  });
});

describe('card text keeps what is not an escape (P5-09)', () => {
  it('EV-33 a real backslash in a Windows path inside prose stays unchanged', () => {
    const prose = 'The loader reads C:\\Users\\tom\\temp\\new\\config.json at start.';

    expect(claimTexts(answerWithClaim(prose))).toEqual([prose]);
  });

  it('EV-33 an escaped backslash before u is not read as an escape', () => {
    const prose = 'The path is C:\\\\u005b kept as a plain path.';

    expect(claimTexts(answerWithClaim(prose))).toEqual([
      'The path is C:\\\\u005b kept as a plain path.',
    ]);
  });

  it('EV-33 citations are read as before: escapes are not decoded in a citation path', () => {
    const raw = answerWithClaim('It reads the file.', [
      'src\\u005bOrders\\u005d/Checkout.cs:10-24',
    ]);
    const parsed = parseCardsLenient(raw);

    expect(parsed.drafts).toEqual([]);
    expect(parsed.problems.map((problem) => problem.path)).toEqual([
      'cards.0.claims.0.citations.0',
    ]);
  });
});

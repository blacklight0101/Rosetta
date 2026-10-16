import { describe, expect, it } from 'vitest';
import {
  parseCardOutput,
  parseCardsLenient,
} from '../../../../src/application/cards/parse-cards.js';
import { validCardJson } from '../../../support/card-fixtures.js';
import { cardObject, cardsJson } from '../../../support/card-output.js';

// RF-208: an answer is read for what is valid in it. Valid claims and cards are kept, the invalid
// ones are dropped and listed with their problems, and a valid answer reads exactly as before.

const goodClaim = { text: 'It creates an order.', citations: ['src/Orders/Checkout.cs:10-24'] };
const badClaim = { text: 'It sends a mail.', citations: ['src/Orders/Mailer.cs line 4'] };
const noCitation = { text: 'It logs the order.', citations: [] };

function answer(...cards: Record<string, unknown>[]): string {
  return JSON.stringify({ cards });
}

describe('parseCardsLenient keeps what is valid', () => {
  it('RF-208 a valid answer parses exactly as the strict reading does, with nothing dropped', () => {
    const lenient = parseCardsLenient(validCardJson);
    const strict = parseCardOutput(validCardJson);

    expect(lenient.problems).toEqual([]);
    expect(lenient.cutOff).toBe(false);
    expect(strict.ok && strict.value).toEqual(lenient.drafts);
    expect(lenient.drafts).toHaveLength(1);
  });

  it('RF-208 a card keeps its valid claims when another claim is invalid, and lists the invalid one', () => {
    const parsed = parseCardsLenient(answer(cardObject({ claims: [goodClaim, badClaim] })));

    expect(parsed.drafts).toHaveLength(1);
    expect(parsed.drafts[0]?.claims.map((claim) => claim.text)).toEqual(['It creates an order.']);
    expect(parsed.problems.map((problem) => problem.path)).toEqual([
      'cards.0.claims.1.citations.0',
    ]);
  });

  it('RF-208 a claim without any citation is dropped and listed, the card stays', () => {
    const parsed = parseCardsLenient(answer(cardObject({ claims: [noCitation, goodClaim] })));

    expect(parsed.drafts[0]?.claims).toHaveLength(1);
    expect(parsed.problems.map((problem) => problem.path)).toEqual(['cards.0.claims.0.citations']);
  });
});

describe('parseCardsLenient drops what is not valid', () => {
  it('RF-208 a card with no valid claim left is dropped and listed, the other cards stay', () => {
    const doomed = cardObject({ title: 'Mailer', claims: [badClaim, noCitation] });
    const parsed = parseCardsLenient(answer(cardObject(), doomed, cardObject({ title: 'Last' })));

    expect(parsed.drafts.map((draft) => draft.title)).toEqual(['Order checkout', 'Last']);
    expect(parsed.problems.map((problem) => problem.path)).toEqual(
      expect.arrayContaining(['cards.1.claims.0.citations.0', 'cards.1.claims.1.citations']),
    );
  });

  it('RF-208 a card whose own field is wrong is dropped and listed whole', () => {
    const parsed = parseCardsLenient(answer(cardObject({ type: 'RULE' }), cardObject()));

    expect(parsed.drafts).toHaveLength(1);
    expect(parsed.problems.map((problem) => problem.path)).toContain('cards.0.type');
  });

  it('RF-208 a card with a wrong field and an invalid claim is dropped with both problems', () => {
    const parsed = parseCardsLenient(
      answer(cardObject({ type: 'RULE', claims: [goodClaim, badClaim] })),
    );

    expect(parsed.drafts).toEqual([]);
    expect(parsed.problems.map((problem) => problem.path)).toEqual(
      expect.arrayContaining(['cards.0.type', 'cards.0.claims.1.citations.0']),
    );
  });
});

describe('parseCardsLenient picks among the cards of an answer', () => {
  it('RF-208 every card invalid gives no drafts and the problems of each', () => {
    const parsed = parseCardsLenient(
      answer(cardObject({ claims: [badClaim] }), cardObject({ title: '' })),
    );

    expect(parsed.drafts).toEqual([]);
    expect(parsed.problems.length).toBeGreaterThanOrEqual(2);
    expect(parsed.cutOff).toBe(false);
  });

  it('RF-208 the valid answer of a later fence beats a broken first one', () => {
    const broken = answer(cardObject({ claims: [badClaim] }));
    const raw = `\`\`\`json\n${broken}\n\`\`\`\nCorrected:\n\`\`\`json\n${cardsJson()}\n\`\`\``;

    const parsed = parseCardsLenient(raw);

    expect(parsed.problems).toEqual([]);
    expect(parsed.drafts).toHaveLength(1);
  });

  it('RF-208 a later answer that is entirely valid beats an earlier one that has more cards but dropped claims', () => {
    const partial = answer(
      cardObject({ title: 'First', claims: [goodClaim, badClaim] }),
      cardObject({ title: 'Second' }),
    );
    const fixed = answer(cardObject({ title: 'First' }));
    const raw = `\`\`\`json\n${partial}\n\`\`\`\nCorrected:\n\`\`\`json\n${fixed}\n\`\`\``;

    const parsed = parseCardsLenient(raw);

    expect(parsed.problems).toEqual([]);
    expect(parsed.drafts.map((draft) => draft.title)).toEqual(['First']);
  });

  it('RF-208 an empty card list is a valid answer with nothing dropped', () => {
    expect(parseCardsLenient('{"cards": []}')).toEqual({ drafts: [], problems: [], cutOff: false });
  });
});

describe('parseCardsLenient takes the JSON out of the answer', () => {
  it('RF-208 JSON inside prose is taken out, with its valid claims kept', () => {
    const json = answer(cardObject({ claims: [goodClaim, badClaim] }));

    const parsed = parseCardsLenient(`I read the area. Here are the cards: ${json} Hope it helps.`);

    expect(parsed.drafts[0]?.claims).toHaveLength(1);
    expect(parsed.problems).toHaveLength(1);
  });

  it('RF-208 JSON inside a code fence is taken out', () => {
    const parsed = parseCardsLenient(`Result:\n\`\`\`json\n${cardsJson()}\n\`\`\`\nDone.`);

    expect(parsed.problems).toEqual([]);
    expect(parsed.drafts).toHaveLength(1);
  });
});

describe('parseCardsLenient reads sloppy JSON', () => {
  it('RF-208 JSON with a trailing comma is read', () => {
    const raw = `{"cards": [${JSON.stringify(cardObject())},],}`;

    const parsed = parseCardsLenient(raw);

    expect(parsed.problems).toEqual([]);
    expect(parsed.drafts).toHaveLength(1);
  });

  it('RF-208 a trailing comma inside a nested list and after whitespace is read', () => {
    const raw = [
      '```json',
      '{ "cards": [ { "type": "FEAT", "title": "Checkout", "area": "orders",',
      '  "summary": "Turns a basket into an order.", "confidence": "High",',
      '  "claims": [ { "text": "It creates an order.",',
      '    "citations": [ "src/Orders/Checkout.cs:10-24", ], }, ], },',
      '  ], }',
      '```',
    ].join('\n');

    const parsed = parseCardsLenient(raw);

    expect(parsed.problems).toEqual([]);
    expect(parsed.drafts).toHaveLength(1);
  });

  it('RF-208 a comma before a bracket inside a string is not touched', () => {
    const card = cardObject({ summary: 'Lists items like [a,] and {b,} in text.' });
    const raw = `{"cards": [${JSON.stringify(card)},],}`;

    const parsed = parseCardsLenient(raw);

    expect(parsed.drafts[0]?.summary).toBe('Lists items like [a,] and {b,} in text.');
  });
});

describe('parseCardsLenient says why it found no card', () => {
  it('RF-208 an answer that is all prose has no drafts, one problem and is not cut off', () => {
    const parsed = parseCardsLenient('I looked at the area and found nothing to report.');

    expect(parsed.drafts).toEqual([]);
    expect(parsed.problems).toHaveLength(1);
    expect(parsed.problems[0]?.message).toMatch(/No JSON found/);
    expect(parsed.cutOff).toBe(false);
  });

  it('RF-208 an answer cut off in the middle of a string is marked cut off', () => {
    const full = cardsJson();
    const cut = full.slice(0, full.indexOf('The shop') + 8);

    const parsed = parseCardsLenient(`Here you go:\n${cut}`);

    expect(parsed.drafts).toEqual([]);
    expect(parsed.cutOff).toBe(true);
    expect(parsed.problems[0]?.message).toMatch(/cut off/);
  });

  it('RF-208 an answer cut off inside an unclosed code fence is marked cut off', () => {
    const full = cardsJson();

    const parsed = parseCardsLenient(`\`\`\`json\n${full.slice(0, full.length - 30)}`);

    expect(parsed.cutOff).toBe(true);
  });

  it('RF-208 JSON that is complete but not valid is not marked cut off', () => {
    const parsed = parseCardsLenient('{"cards": [{"type": "FEAT" "title": "x"}]}');

    expect(parsed.drafts).toEqual([]);
    expect(parsed.cutOff).toBe(false);
    expect(parsed.problems).toHaveLength(1);
  });

  it('RF-208 more cards than the limit keeps the first ones and lists the rest as dropped', () => {
    const many = Array.from({ length: 101 }, (_, index) =>
      cardObject({ title: `Card ${String(index)}` }),
    );

    const parsed = parseCardsLenient(answer(...many));

    expect(parsed.drafts).toHaveLength(100);
    expect(parsed.problems.map((problem) => problem.path)).toEqual(['cards.100']);
  });
});

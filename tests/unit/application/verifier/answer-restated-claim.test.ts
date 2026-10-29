import { describe, expect, it } from 'vitest';
import {
  restatedAnswerReason,
  type OwnerAnswer,
} from '../../../../src/application/verifier/answer-restated-claim.js';

// RF-301, RF-209, ADR-005, ADR-013, DEC-198, EV-56: an owner's answer is an owner fact, never source.
// A claim that only restates it, resting on the lines the question was raised from, is rejected
// without a model; a claim that cites those lines for what they show stays judgeable.

const SHEETS = 'Invoice_Generator.xlsm/workbook.md';

const answer: OwnerAnswer = {
  ...{ area: 'Invoice_Generator.xlsm', cardId: 'OQ-002' },
  context: `${SHEETS}:14-20 The workbook lists the sheets of the invoice file. (also cited: ${SHEETS}:30-31)`,
  answer:
    'The clerk fills the Template sheet with the customer and the items, then the macro copies the Template into a new invoice sheet and saves the invoice.',
};

function cite(text: string) {
  const at = text.lastIndexOf(':');
  const [start = 0, end = start] = text
    .slice(at + 1)
    .split('-')
    .map(Number);
  return { path: text.slice(0, at), startLine: start, endLine: end };
}

const claim = (text: string, ...citations: string[]) => ({ text, citations: citations.map(cite) });

const restating = 'The macro copies the Template sheet into a new invoice sheet.';

describe('a claim that restates the owner answer on the lines of the question', () => {
  it('DEC-198 is rejected with the reason "restates the owner\'s answer"', () => {
    const reason = restatedAnswerReason(claim(restating, `${SHEETS}:14-20`), [answer]);

    expect(reason).toContain("restates the owner's answer");
    expect(reason).toContain('OQ-002');
  });

  it('DEC-198 is rejected when its citations sit in different ranges of the context', () => {
    const reason = restatedAnswerReason(claim(restating, `${SHEETS}:15-16`, `${SHEETS}:30-31`), [
      answer,
    ]);

    expect(reason).toContain("restates the owner's answer");
  });

  it('DEC-198 is rejected for the range an also-cited path holds', () => {
    expect(restatedAnswerReason(claim(restating, `${SHEETS}:30-31`), [answer])).toBeDefined();
  });
});

describe('a claim the rule leaves to the verifier', () => {
  it('DEC-198 stays judgeable when it says what the same lines show', () => {
    const shows = claim(
      'The workbook index lists the sheets Items, Totals and Config.',
      `${SHEETS}:14-20`,
    );

    expect(restatedAnswerReason(shows, [answer])).toBeUndefined();
  });

  it('DEC-198 stays judgeable when one citation sits outside the context lines', () => {
    const mixed = claim(
      restating,
      `${SHEETS}:14-20`,
      'Invoice_Generator.xlsm/Invoice/formulas.md:2-4',
    );

    expect(restatedAnswerReason(mixed, [answer])).toBeUndefined();
  });

  it('DEC-198 stays judgeable when the lines are in another file', () => {
    const other = claim(restating, 'Other/workbook.md:14-20');

    expect(restatedAnswerReason(other, [answer])).toBeUndefined();
  });

  it('DEC-198 stays judgeable when the citations run past the context range', () => {
    expect(restatedAnswerReason(claim(restating, `${SHEETS}:14-40`), [answer])).toBeUndefined();
  });

  it('DEC-198 does nothing for a task that was given no answer', () => {
    expect(restatedAnswerReason(claim(restating, `${SHEETS}:14-20`), [])).toBeUndefined();
  });

  it('DEC-198 does nothing for a claim with no citation', () => {
    expect(restatedAnswerReason(claim(restating), [answer])).toBeUndefined();
  });

  it('DEC-198 leaves a short claim that shares a word or two with the answer alone', () => {
    const short = claim('The Template sheet exists.', `${SHEETS}:14-20`);

    expect(restatedAnswerReason(short, [answer])).toBeUndefined();
  });
});

describe('the answer a claim restates', () => {
  it('DEC-198 is the one of the question whose lines it cites', () => {
    const other: OwnerAnswer = {
      ...{ area: 'Invoice_Generator.xlsm', cardId: 'OQ-009' },
      ...{ context: 'Elsewhere/notes.md:1-3 A note.' },
      answer: 'Customers pay by bank transfer within thirty days.',
    };

    const reason = restatedAnswerReason(claim(restating, `${SHEETS}:14-20`), [other, answer]);

    expect(reason).toContain('OQ-002');
  });
});

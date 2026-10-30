import { describe, expect, it } from 'vitest';
import {
  restatedAnswerReason,
  type OwnerAnswer,
} from '../../../../src/application/verifier/answer-restated-claim.js';
import type { CitedExcerpt } from '../../../../src/application/verifier/cited-lines.js';
import {
  featureC3,
  oq002,
  restatedClaims,
  sheetExcerpt,
  sheetListClaims,
  SHEETS_FILE,
} from '../../../support/invoice-owner-answer.js';

// RF-301, RF-209, ADR-005, DEC-198, EV-56: an owner's answer is an owner fact, never source. A claim
// that rests on the lines its question was raised from, and whose words beyond those lines are the
// words of the answer, is rejected without a model; a claim that says what the lines show is not.
// The texts are those of the Invoice Deepen 90c48e40.

const cite = (startLine: number, endLine: number, path = SHEETS_FILE) => ({
  ...{ path, startLine, endLine },
});
const claim = (text: string, ...citations: ReturnType<typeof cite>[]) => ({ text, citations });
const onContext = (text: string) => claim(text, cite(14, 20));

describe('the real claim of EV-56 (FEAT-001.c14, judged as FEAT-002.c3)', () => {
  it('DEC-198 is rejected with the reason "restates the owner\'s answer"', () => {
    const reason = restatedAnswerReason(onContext(featureC3), [oq002], [sheetExcerpt]);

    expect(reason).toContain("restates the owner's answer");
    expect(reason).toContain('OQ-002');
  });

  it.each(restatedClaims)('DEC-198 is rejected for the restatement: %s', (text) => {
    expect(restatedAnswerReason(onContext(text), [oq002], [sheetExcerpt])).toBeDefined();
  });
});

describe('a true claim about the sheet table the question was raised from', () => {
  it.each(sheetListClaims)('DEC-198 stays judgeable: %s', (text) => {
    expect(restatedAnswerReason(onContext(text), [oq002], [sheetExcerpt])).toBeUndefined();
  });
});

describe('a claim the rule leaves to the verifier', () => {
  it('DEC-198 when one citation sits outside the context lines', () => {
    const outside = cite(2, 4, 'Invoice_Generator.xlsm/Invoice/f.md');
    const mixed = claim(featureC3, cite(14, 20), outside);

    expect(restatedAnswerReason(mixed, [oq002], [sheetExcerpt])).toBeUndefined();
  });

  it('DEC-198 when the lines are in another file', () => {
    const other = claim(featureC3, cite(14, 20, 'Other/workbook.md'));

    expect(restatedAnswerReason(other, [oq002], [sheetExcerpt])).toBeUndefined();
  });

  it('DEC-198 when the citations run past the context range', () => {
    expect(restatedAnswerReason(claim(featureC3, cite(14, 40)), [oq002], [])).toBeUndefined();
  });

  it('DEC-198 for a task that was given no answer, or a claim with no citation', () => {
    expect(restatedAnswerReason(onContext(featureC3), [], [sheetExcerpt])).toBeUndefined();
    expect(restatedAnswerReason(claim(featureC3), [oq002], [sheetExcerpt])).toBeUndefined();
  });

  it('DEC-198 when only one or two of its new words come from the answer', () => {
    const little = onContext('The Template sheet is exported.');

    expect(restatedAnswerReason(little, [oq002], [sheetExcerpt])).toBeUndefined();
  });

  it('DEC-198 when its new words are not the answer words', () => {
    const own = onContext('The table lists seven sheets, five of them for customers and prices.');

    expect(restatedAnswerReason(own, [oq002], [sheetExcerpt])).toBeUndefined();
  });
});

describe('the answer a claim restates', () => {
  it('DEC-198 is the one of the question whose lines it cites', () => {
    const other: OwnerAnswer = {
      ...{ area: oq002.area, cardId: 'OQ-009', question: 'How do customers pay?' },
      ...{ context: 'Elsewhere/notes.md:1-3 A note.' },
      answer: 'Customers pay by bank transfer within thirty days.',
    };

    const reason = restatedAnswerReason(onContext(featureC3), [other, oq002], [sheetExcerpt]);

    expect(reason).toContain('OQ-002');
  });
});

describe('a short answer', () => {
  const path = 'Catalog/Details.aspx.cs';
  const lines: CitedExcerpt = {
    ...{ path, startLine: 5, endLine: 8, skipped: false },
    lines: [
      'protected void Page_Load(object sender, System.EventArgs e)',
      'NameLabel.Text = "Item";',
    ],
  };
  const short: OwnerAnswer = {
    ...{ area: 'Catalog', cardId: 'OQ-001', answer: 'Yes, intended.' },
    question: 'Does the shop want every product page to show one fixed placeholder title?',
    context: 'Catalog/Details.aspx.cs:5-8 The name label is set to a fixed text.',
  };
  const on = (text: string) => claim(text, cite(5, 8, path));

  it('DEC-198 is read with its question, so a claim restating the question is rejected', () => {
    const text = 'The shop wants every product page to show one fixed placeholder title.';

    expect(restatedAnswerReason(on(text), [short], [lines])).toContain(
      "restates the owner's answer",
    );
  });

  it('DEC-198 a claim about what the lines show is still judged', () => {
    const text = 'The page sets the name label to the text Item when it loads.';

    expect(restatedAnswerReason(on(text), [short], [lines])).toBeUndefined();
  });
});

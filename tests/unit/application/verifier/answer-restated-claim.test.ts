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
  // A short answer says too little to tell a restatement from a fact about the lines, and the words of
  // its question describe the context lines: the claim is left to the verifier model (a known gap).
  const details = 'Catalog/Details.aspx.cs';
  const service = 'Services/CatalogService.cs';
  const excerpt = (path: string, startLine: number, lines: string[]): CitedExcerpt => ({
    ...{ path, startLine, endLine: startLine + lines.length - 1, skipped: false, lines },
  });
  const load = excerpt(details, 5, [
    '        protected void Page_Load(object sender, System.EventArgs e)',
    '        {',
    '            NameLabel.Text = "Item";',
    '        }',
  ]);
  const update = excerpt(service, 12, [
    '            var sql = "UPDATE CatalogItem SET Stock = Stock - 1 WHERE Id = @id";',
  ]);
  const yes = (cardId: string, question: string, context: string): OwnerAnswer => ({
    ...{ area: 'X', cardId, question, context, answer: 'Yes' },
  });
  const nameQ = yes(
    'OQ-001',
    'Does the shop want every product page to show the same name Item?',
    `${details}:5-8 The name label is set to a fixed text.`,
  );
  const stockQ = yes(
    'OQ-002',
    'Is the stock lowered by one every time the list is loaded?',
    `${service}:12-12 The stock is lowered.`,
  );

  it.each([
    ['Every product details page shows the same name, Item.', nameQ, load, [5, 8]],
    ['The page shows the same fixed name for every product.', nameQ, load, [5, 8]],
    [
      'On load the details page shows the name Item whatever product is displayed.',
      nameQ,
      load,
      [5, 8],
    ],
    ['The query lowers the stock of one catalog item by one.', stockQ, update, [12, 12]],
    ['The stock is lowered by one every time the list is loaded.', stockQ, update, [12, 12]],
  ] as const)('DEC-198 leaves a true claim to the model: %s', (text, answer, lines, at) => {
    const cited = claim(text, cite(at[0], at[1], lines.path));

    expect(restatedAnswerReason(cited, [answer], [lines])).toBeUndefined();
  });
});

describe('the words of the cited lines', () => {
  it('DEC-198 are split at camelCase, PascalCase and snake_case, so CatalogItem holds catalog and item', () => {
    const lines: CitedExcerpt = {
      ...{ path: 'Services/CatalogService.cs', startLine: 12, endLine: 12, skipped: false },
      lines: ['var sql = "UPDATE CatalogItem SET Stock = Stock - 1 WHERE order_id = @id";'],
    };
    const owner: OwnerAnswer = {
      ...{ area: 'X', cardId: 'OQ-003', question: 'Does a sale lower the stock?' },
      context: 'Services/CatalogService.cs:12-12 The stock is lowered.',
      answer: 'Sales lower catalog item stock, one unit each time, per order.',
    };
    const text = 'It updates the catalog item stock by one unit for the order.';

    const cited = claim(text, cite(12, 12, 'Services/CatalogService.cs'));
    expect(restatedAnswerReason(cited, [owner], [lines])).toBeUndefined();
  });
});

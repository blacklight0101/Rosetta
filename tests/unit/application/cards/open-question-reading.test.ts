import { describe, expect, it } from 'vitest';
import { parseCardsLenient } from '../../../../src/application/cards/parse-cards.js';
import { cardObject } from '../../../support/card-output.js';

// RF-243, Q-46: an OQ card that asks for a value, a formula, a count, a list of columns or headers,
// or whether two parts of the workbook or code match is refused with a repair message that sends the
// agent to read the file that holds the answer. Genuine questions (intent, reasons, external
// systems, volumes, users, the meaning of states for the business) pass.

function openQuestion(question: string) {
  return cardObject({
    type: 'OQ',
    title: 'Open question',
    summary: 'The workbook keeps loans in a table with a state column.',
    question,
    whyItMatters: 'The specification cannot say it without the answer.',
  });
}

function parsed(question: string) {
  return parseCardsLenient(JSON.stringify({ cards: [openQuestion(question)] }));
}

const refused = [
  // The three questions of the evaluation run of 2026-10-21 (workbook).
  'Does the total number of sheets in the workbook match the number of sheets listed in workbook.md?',
  'What is the specific formula logic used in column F of the Loans sheet?',
  'Are all the columns of the Loans table visible as headers in the first row of the sheet?',
  // The other shapes of Q-46, for workbooks.
  'What is the value of cell B4 on the Rates sheet?',
  'How many sheets does the workbook have?',
  'How many columns does the Loans table have?',
  'What is the total number of rows in the Loans sheet?',
  'Which columns does the Loans table have?',
  'What are the headers of the Loans sheet?',
  'What formula is used in column F?',
  'Do the totals in column D equal the sum of column C?',
  // Code projects.
  'What does this function return?',
  'What does the CalculateTotal method return?',
  'How many parameters does this method take?',
  'What is the value of the MaxItems constant in the Orders class?',
  'Does the number of fields in the Order class match the columns of the Orders table?',
  'What parameters does this function take?',
];

const kept = [
  'What is the reason the value in cell B4 is hardcoded?',
  'What is the meaning of the formula in column F for the business?',
  'How many rows does the finance team expect in the Loans sheet in a year?',
  'How many rows does the Loans sheet receive per month?',
  'How many sheets does the workbook hold in production?',
  'What do REPAIR, DAMAGED and USABLE mean for the business?',
  'Why is the discount capped at 10%?',
  'Why does the Loans sheet use a different rate in column F for loans over 5 years?',
  'Who fills in column F of the Loans sheet?',
  'Why is the sheet Archive hidden?',
  'How many loans per month does the finance team process with this workbook?',
  'Which external system receives the totals of the Loans sheet?',
  'What happens to a loan that stays DAMAGED for more than a year?',
  'Who decides that a column is added to the Loans table?',
  'What should the new system do when the rate in column F is empty?',
  'Why does this function return zero for an empty order?',
  'Which team asked for the number of sheets to stay at three?',
  'Is the discount of 10% agreed with the sales team?',
];

describe('RF-243 questions the workbook or the code already answers (Q-46)', () => {
  it.each(refused)('RF-243 refuses "%s" and sends the agent to read the file', (question) => {
    const result = parsed(question);

    expect(result.drafts).toEqual([]);
    expect(result.problems).toHaveLength(1);
    expect(result.problems[0]?.path).toBe('cards.0.question');
    expect(result.problems[0]?.message).toMatch(/read the file/iu);
    expect(result.problems[0]?.message).toMatch(
      /a value, a formula, a count, a list of columns or headers, or whether two parts match/iu,
    );
  });

  it.each(kept)('RF-243 keeps "%s"', (question) => {
    const result = parsed(question);

    expect(result.problems).toEqual([]);
    expect(result.drafts.map((draft) => draft.question)).toEqual([question]);
  });

  it('RF-243 still refuses a question about what the area does with the earlier message', () => {
    const result = parsed('What does this area do?');

    expect(result.problems[0]?.message).toMatch(/what the code, an area or the application does/iu);
  });

  it('RF-243 refuses a disguised question with a fullwidth letter', () => {
    const result = parsed('Ｈow many sheets does the workbook have?');

    expect(result.drafts).toEqual([]);
  });
});

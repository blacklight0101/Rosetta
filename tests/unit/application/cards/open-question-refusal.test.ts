import { describe, expect, it } from 'vitest';
import { parseCardsLenient } from '../../../../src/application/cards/parse-cards.js';
import { cardObject } from '../../../support/card-output.js';

// RF-243, DEC-136: an OQ card says what the code shows (its summary), cites the code that raised the
// question (a claim with a citation) and asks about something outside the code. A question asking
// what the code, an area or the application does is refused with a repair message that sends the
// agent back to reading.

function openQuestion(question: string, overrides: Record<string, unknown> = {}) {
  return cardObject({
    type: 'OQ',
    title: 'Open question',
    summary: 'The discount code is read from the order form and applied to the total.',
    question,
    whyItMatters: 'The specification cannot say it without the answer.',
    ...overrides,
  });
}

function parsed(...cards: Record<string, unknown>[]) {
  return parseCardsLenient(JSON.stringify({ cards }));
}

const refused = [
  'What does this area do?',
  'What does the orders area do?',
  'what does this module do',
  'What is the purpose of the application?',
  'What is the purpose of this area?',
  'What is the business logic of the checkout?',
  'What is the business logic of X?',
  'What is the logic of the Orders module?',
  'How does the checkout code work?',
  'Can you explain what this application does?',
  'Describe what the Orders area does.',
  'What is this application for?',
  'What is the role of the Catalog area?',
  'What does the Orders area actually do?',
  'What is this area responsible for?',
  'What does OrderService do?',
  'Explain how the checkout code works.',
  'Describe what the Orders area does.',
];

// Fullwidth letters, a Cyrillic look-alike and zero-width characters must not hide a refused question.
const disguised = [
  'Ｗｈａｔ does this area do?',
  'Whаt does this area do?',
  'What do​es this ar⁠ea do?',
  'W​hat is the purpose of the application?',
];

const kept = [
  'Who uses these pages?',
  'Is a catalog item with zero stock still shown on the home page?',
  'Why is the free-shipping threshold 50 and not 100?',
  'What is the purpose of the 50 unit threshold in the shipping rule?',
  'How many orders per day does the legacy system handle?',
  'Which external system receives the invoice export?',
  'Who decided that a refund needs two approvals?',
  'What does the finance team expect when the discount is zero?',
  'Explain why orders over 5000 need a second approver.',
  'Describe how many orders per day this service handles.',
  'Explain the reason for the rounding rule in the invoice total.',
  'Describe who approves a refund over 200.',
  'What does the finance team do with the unmatched payments?',
];

describe('RF-243 questions asking what the code does', () => {
  it.each(refused)(
    'RF-243 refuses "%s" with a message that sends the agent to read',
    (question) => {
      const result = parsed(openQuestion(question));

      expect(result.drafts).toEqual([]);
      expect(result.problems).toHaveLength(1);
      expect(result.problems[0]?.path).toBe('cards.0.question');
      expect(result.problems[0]?.message).toMatch(/read the code/iu);
      expect(result.problems[0]?.message).toMatch(
        /what the code, an area or the application does/iu,
      );
    },
  );

  it.each(disguised)('RF-243 refuses a disguised "%s"', (question) => {
    const result = parsed(openQuestion(question));

    expect(result.drafts).toEqual([]);
    expect(result.problems[0]?.path).toBe('cards.0.question');
  });

  it.each(kept)('RF-243 keeps "%s"', (question) => {
    const result = parsed(openQuestion(question));

    expect(result.problems).toEqual([]);
    expect(result.drafts.map((draft) => draft.question)).toEqual([question]);
  });

  it('RF-243 keeps a question about intent that cites the code, as before', () => {
    const result = parsed(openQuestion('Who uses these pages?'));

    expect(result.drafts).toHaveLength(1);
    expect(result.drafts[0]?.claims[0]?.citations).toHaveLength(1);
  });
});

describe('RF-243 the rest of the answer', () => {
  it('RF-243 refuses the question but keeps the other cards of the answer', () => {
    const result = parsed(
      cardObject({ title: 'Order checkout' }),
      openQuestion('What does this area do?'),
      openQuestion('Who uses these pages?'),
    );

    expect(result.drafts.map((draft) => draft.title)).toEqual(['Order checkout', 'Open question']);
    expect(result.problems.map((problem) => problem.path)).toEqual(['cards.1.question']);
  });

  it('RF-243 refuses an open question that cites no code', () => {
    const result = parsed(
      openQuestion('Who uses these pages?', { claims: [{ text: 'They exist.', citations: [] }] }),
    );

    expect(result.drafts).toEqual([]);
    expect(result.problems.length).toBeGreaterThan(0);
  });

  it('RF-243 refuses an open question that does not say what the code shows', () => {
    const result = parsed(openQuestion('Who uses these pages?', { summary: '' }));

    expect(result.drafts).toEqual([]);
    expect(result.problems.map((problem) => problem.path)).toContain('cards.0.summary');
  });

  it('RF-243 does not apply the refusal to a card that is not an open question', () => {
    const result = parsed(cardObject({ title: 'What does this area do?' }));

    expect(result.problems).toEqual([]);
    expect(result.drafts).toHaveLength(1);
  });
});

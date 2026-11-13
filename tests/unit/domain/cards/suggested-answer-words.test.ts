import { describe, expect, it } from 'vitest';
import {
  isEitherOrQuestion,
  isOpenQuestion,
  startsWithYesOrNo,
} from '../../../../src/domain/cards/suggested-answer.js';
import { eitherOrQuestion, eitherOrYesBut } from '../../../support/eshop-near-repeats.js';
import { agentCardsSchema } from '../../../../src/application/cards/card-schema.js';

// RF-645, P8-08 (EV-89): "In which" and "For whom" questions are open questions, "No one" answers a
// Who question, and the words of a suggested answer are joined with a space, never with nothing.

describe('P8-08 the open question patterns', () => {
  it.each(['In which module is the rate set?', 'For whom is the report written?', 'Who signs it?'])(
    'RF-645 treats "%s" as an open question',
    (question) => {
      expect(isOpenQuestion(question)).toBe(true);
    },
  );

  it('RF-645 keeps a yes/no question closed', () => {
    expect(isOpenQuestion('Is the rate fixed?')).toBe(false);
    expect(isOpenQuestion('For sale items, is the rate fixed?')).toBe(false);
  });

  it('RF-645 does not take "No one" or "None" for a No', () => {
    expect(startsWithYesOrNo('No one; the batch job does it')).toBe(false);
    expect(startsWithYesOrNo('No, the batch job does it')).toBe(true);
    expect(startsWithYesOrNo('Yes')).toBe(true);
  });
});

function card(answer: string) {
  const answers = [answer, 'A second answer', 'A third answer'].map((each, index) => ({
    answer: each,
    description: 'What follows from it.',
    recommended: index === 0,
  }));
  return {
    cards: [
      {
        type: 'OQ',
        title: 'Rate',
        area: 'Billing',
        summary: 'The rate.',
        confidence: 'Low',
        claims: [{ text: 'c', citations: ['Billing/Rate.cs:1-4'] }],
        question: 'Who sets the rate?',
        whyItMatters: 'It decides.',
        suggestedAnswers: answers,
      },
    ],
  };
}

describe('P8-08 the words of a suggested answer', () => {
  it.each([
    ['A fixed\nbusiness rule of 50%', 'A fixed business rule of 50%'],
    ['A fixed\u200bbusiness rule of 50%', 'A fixed business rule of 50%'],
    ['A fixed\r\n  business\trule', 'A fixed business rule'],
  ])('RF-645 joins %j with a space', (written, expected) => {
    const parsed = agentCardsSchema.safeParse(card(written));

    expect(parsed.success).toBe(true);
    expect(parsed.data?.cards[0]?.suggestedAnswers?.[0]?.answer).toBe(expected);
  });
});

describe('P9-13 an either-or question', () => {
  it.each([
    eitherOrQuestion,
    'Does the basket keep items for a day or for a week?',
    'Is the catalog read by the web shop or by the admin tool?',
  ])('RF-645 detects "%s"', (question) => {
    expect(isEitherOrQuestion(question)).toBe(true);
  });
  it.each([
    'Is the rate fixed?',
    'Is the rate fixed or not?',
    'Are the rates fixed or variable?',
    'Is the order and/or the basket cleared?',
    'Which team runs the catalog or the basket?',
    'Can a customer cancel or return an order?',
    'Is the user required to log in or register first?',
    'Does the shop ship to Spain or Portugal?',
    'Is the data stored in SQL or NoSQL, or both?',
    'Is the data stored in SQL or in NoSQL, or both?',
  ])('RF-645 does not take "%s" for an either-or question', (question) => {
    expect(isEitherOrQuestion(question)).toBe(false);
  });
});

function answered(question: string, answers: readonly string[]) {
  const suggestedAnswers = answers.map((each, index) => ({
    answer: each,
    description: 'What follows from it.',
    recommended: index === 0,
  }));
  const base = card('x').cards[0];
  const parsed = agentCardsSchema.safeParse({ cards: [{ ...base, question, suggestedAnswers }] });
  return parsed.data?.cards[0]?.suggestedAnswers?.map((each) => each.answer);
}

describe('P9-13 a Yes or No answer to an either-or question is dropped, never the card', () => {
  const side = 'Another system, with a shared catalog';
  it('RF-645 drops only the Yes/No answer when the recommended one and three others stay', () => {
    expect(answered(eitherOrQuestion, [side, eitherOrYesBut, 'This team', 'A mix'])).toEqual([
      side,
      'This team',
      'A mix',
    ]);
  });
  it('RF-645 keeps the card as written when dropping would leave fewer than three answers', () => {
    const written = [side, eitherOrYesBut, 'This team'];
    expect(answered(eitherOrQuestion, written)).toEqual(written);
  });
  it('RF-645 keeps the card as written when the recommended answer is the Yes', () => {
    const written = [eitherOrYesBut, side, 'This team', 'A mix'];
    expect(answered(eitherOrQuestion, written)).toEqual(written);
  });
  it('RF-645 keeps a plain yes/no question with its qualified Yes', () => {
    const written = ['Yes', 'No', eitherOrYesBut];
    expect(answered('Is the rate fixed?', written)).toEqual(written);
  });
  it('RF-645 still refuses a Yes on an open question', () => {
    expect(answered('Who sets the rate?', ['Yes', 'The team', 'Finance'])).toBeUndefined();
  });
});

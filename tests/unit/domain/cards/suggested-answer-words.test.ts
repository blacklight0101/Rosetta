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
    'Are the rates fixed or variable?',
    'Does the basket keep items for a day or for a week?',
  ])('RF-645 detects "%s"', (question) => {
    expect(isEitherOrQuestion(question)).toBe(true);
  });
  it.each([
    'Is the rate fixed?',
    'Is the rate fixed or not?',
    'Is the order and/or the basket cleared?',
    'Which team runs the catalog or the basket?',
  ])('RF-645 does not take "%s" for an either-or question', (question) => {
    expect(isEitherOrQuestion(question)).toBe(false);
  });
  it('RF-645 refuses "Yes, but" on an either-or question and accepts a side', () => {
    const withAnswer = (first: string) => ({
      cards: [{ ...card(first).cards[0], question: eitherOrQuestion }],
    });
    const refused = agentCardsSchema.safeParse(withAnswer(eitherOrYesBut));
    expect(refused.success).toBe(false);
    expect(JSON.stringify(refused.error?.issues)).toContain('two sides');
    expect(
      agentCardsSchema.safeParse(withAnswer('Another system, with a shared catalog')).success,
    ).toBe(true);
  });
});

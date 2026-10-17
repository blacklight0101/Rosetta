import { describe, expect, it } from 'vitest';
import type { AnsweredQuestion } from '../../../../src/application/ports/answers-file.js';
import type { PriorCard } from '../../../../src/application/ports/prior-cards.js';
import { planRerun } from '../../../../src/application/understand/answer-rerun.js';

// RF-241, RF-243: answers.md holds a question asked by several areas once, under the id of the first
// card; the OQ cards of the other areas stay on disk. A re-run uses the answer for every card behind
// the question, in the area of each card.

const project = { userId: 'u-1', projectId: 'p-1' };
const runKey = '20261012-100000-understand';

const card = (id: string, area: string, question: string, state: 'Open' | 'Answered' = 'Open') =>
  ({
    ...{ id, type: 'OQ', title: 'A question', area, claims: [] },
    ...{ question, questionState: state },
  }) satisfies PriorCard;

const asked: AnsweredQuestion = {
  ...{ cardId: 'OQ-001', runKey, question: 'Who uses the catalog pages?' },
  context: 'a.cs:1-2 x (also cited: b.cs:3-4)',
  answer: 'Staff.',
};

function deps(cards: readonly PriorCard[]) {
  return {
    answers: { answeredQuestions: () => Promise.resolve([asked]) },
    cards: { cardsOf: () => Promise.resolve(cards), markAnswered: () => Promise.resolve([]) },
  };
}

describe('the cards behind a question merged in answers.md', () => {
  it('RF-241 RF-243 is pending for each card that asked it, with the area of the card', async () => {
    const plan = await planRerun(
      deps([
        card('OQ-001', 'Catalog', 'Who uses the catalog pages?'),
        card('OQ-002', 'Controllers', 'who uses the catalog pages'),
        card('OQ-003', 'Services', 'Who uses the Catalog pages?!'),
        card('OQ-004', 'Services', 'How many items are there?'),
      ]),
      project,
      ['Catalog', 'Controllers', 'Services'],
    );

    expect(plan.pending.map((each) => [each.cardId, each.area])).toEqual([
      ['OQ-001', 'Catalog'],
      ['OQ-002', 'Controllers'],
      ['OQ-003', 'Services'],
    ]);
    expect(plan.skipped).toEqual([]);
  });
});

describe('two sections of one run for the same question', () => {
  it('RF-241 RF-243 uses each card once, with the first answer', async () => {
    const plan = await planRerun(
      {
        answers: {
          answeredQuestions: () =>
            Promise.resolve([asked, { ...asked, cardId: 'OQ-002', answer: 'Everyone.' }]),
        },
        cards: {
          markAnswered: () => Promise.resolve([]),
          cardsOf: () =>
            Promise.resolve([
              card('OQ-001', 'Catalog', 'Who uses the catalog pages?'),
              card('OQ-002', 'Services', 'who uses the catalog pages'),
            ]),
        },
      },
      project,
      ['Catalog', 'Services'],
    );

    expect(plan.pending.map((each) => [each.cardId, each.answer])).toEqual([
      ['OQ-001', 'Staff.'],
      ['OQ-002', 'Staff.'],
    ]);
  });
});

describe('the other cards behind a question merged in answers.md', () => {
  it('RF-241 leaves out a card behind the question that is Answered or in an area gone from the map', async () => {
    const plan = await planRerun(
      deps([
        card('OQ-001', 'Catalog', 'Who uses the catalog pages?'),
        card('OQ-002', 'Controllers', 'who uses the catalog pages', 'Answered'),
        card('OQ-003', 'Retired', 'who uses the catalog pages'),
      ]),
      project,
      ['Catalog', 'Controllers'],
    );

    expect(plan.pending.map((each) => each.cardId)).toEqual(['OQ-001']);
    expect(plan.skipped).toEqual([]);
  });

  it('RF-241 does not mix the cards of another run', async () => {
    const plan = await planRerun(
      {
        answers: { answeredQuestions: () => Promise.resolve([asked]) },
        cards: {
          markAnswered: () => Promise.resolve([]),
          cardsOf: (_project, key) =>
            Promise.resolve(
              key === runKey
                ? [card('OQ-001', 'Catalog', 'Who uses the catalog pages?')]
                : [card('OQ-002', 'Services', 'Who uses the catalog pages?')],
            ),
        },
      },
      project,
      ['Catalog', 'Services'],
    );

    expect(plan.pending.map((each) => each.cardId)).toEqual(['OQ-001']);
  });
});

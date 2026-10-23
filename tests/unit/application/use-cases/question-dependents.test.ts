import { describe, expect, it } from 'vitest';
import type { PriorCard, PriorCards } from '../../../../src/application/ports/prior-cards.js';
import { consolidatedStates } from '../../../../src/application/use-cases/question-states.js';

// RF-1017, RF-243: how many cards depend on an open question: the cards that are not open questions
// and cite a file one of the cards behind the question cites (a question asked by several areas is
// one question that keeps every citation).

const project = { userId: 'u-1', projectId: 'p-1' };

function card(id: string, type: PriorCard['type'], cited: readonly string[], question?: string) {
  return {
    ...{ id, type, title: id, area: 'Catalog', claims: ['A claim.'], cited },
    ...(question === undefined ? {} : { question, questionState: 'Open' as const }),
  } satisfies PriorCard;
}

function cardsOf(list: readonly PriorCard[]): PriorCards {
  return { cardsOf: () => Promise.resolve(list), markAnswered: () => Promise.resolve([]) };
}

const asked = (cardId: string, question: string) => ({ cardId, question, context: '', answer: '' });

describe('the cards that depend on an open question', () => {
  it('RF-1017 counts the other cards that cite a file the question cites', async () => {
    const cards = cardsOf([
      card('OQ-001', 'OQ', ['Orders/Order.cs'], 'Who may cancel?'),
      card('BR-001', 'BR', ['Orders/Order.cs']),
      card('BR-002', 'BR', ['Orders/Order.cs', 'Other.cs']),
      card('BR-003', 'BR', ['Elsewhere.cs']),
      card('OQ-002', 'OQ', ['Orders/Order.cs'], 'Which tax?'),
    ]);

    const states = await consolidatedStates(cards, project, 'run', [
      asked('OQ-001', 'Who may cancel?'),
    ]);

    expect(states).toEqual([expect.objectContaining({ cardId: 'OQ-001', dependents: 2 })]);
  });

  it('RF-1017 RF-243 adds the citations of the cards of a merged question', async () => {
    const cards = cardsOf([
      card('OQ-001', 'OQ', ['A.cs'], 'Who may cancel?'),
      card('OQ-004', 'OQ', ['B.cs'], 'who may cancel'),
      card('BR-001', 'BR', ['A.cs']),
      card('BR-002', 'BR', ['B.cs']),
    ]);

    const [first] = await consolidatedStates(cards, project, 'run', [
      asked('OQ-001', 'Who may cancel?'),
    ]);

    expect(first?.dependents).toBe(2);
  });

  it('RF-1017 is zero for a question whose card is gone or that cites nothing', async () => {
    const cards = cardsOf([card('OQ-001', 'OQ', [], 'Who?'), card('BR-001', 'BR', ['A.cs'])]);

    const states = await consolidatedStates(cards, project, 'run', [
      asked('OQ-001', 'Who?'),
      asked('OQ-009', 'Gone?'),
    ]);

    expect(states.map((each) => each.dependents)).toEqual([0, 0]);
  });
});

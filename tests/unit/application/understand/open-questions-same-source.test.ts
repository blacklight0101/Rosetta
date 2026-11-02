import { describe, expect, it } from 'vitest';
import { assignCardIds, type CardDraft } from '../../../../src/domain/cards/card-ids.js';
import {
  mergedQuestionsOf,
  openQuestionsOf,
} from '../../../../src/application/understand/open-questions.js';
import { draftOf } from '../../../support/card-fixtures.js';

// RF-243, RF-646, EV-89, P8-08: two questions of one run that ask about the same cited range, or the
// same subject in other words, are one question before the list is written. Two that only share a
// file stay two. Synthetic names only.

function question(text: string, path: string, start: number, end: number): CardDraft {
  return draftOf({
    type: 'OQ',
    title: text,
    question: text,
    whyItMatters: 'It decides the specification.',
    claims: [
      { text: `Code behind ${text}`, citations: [{ path, startLine: start, endLine: end }] },
    ],
  });
}

function cardsOf(...drafts: CardDraft[]) {
  const built = assignCardIds([{ agentTaskId: 'task-1', area: 'invoice', drafts }]);
  if (!built.ok) throw new Error('the test cards are invalid');
  return built.value;
}

const macro = 'Invoice/modInvoice.bas';

describe('P8-08 questions of one run that ask about the same source', () => {
  it('EV-89 merges two questions about the same VBA source and cited range', () => {
    const cards = cardsOf(
      question('What does the VBA source of the invoice macro do?', macro, 1, 40),
      question('Is the VBA source of the invoice macro complete?', macro, 1, 40),
    );

    expect(openQuestionsOf(cards, 'run-1')).toHaveLength(1);
    expect(mergedQuestionsOf(cards, 'run-1')).toHaveLength(1);
  });

  it('EV-89 merges the same subject asked with another question word', () => {
    const cards = cardsOf(
      question('Which Azure services does the shop use?', 'Shop/Startup.cs', 3, 9),
      question('What Azure services does the shop depend on?', 'Shop/Config.cs', 1, 5),
    );

    expect(openQuestionsOf(cards, 'run-1')).toHaveLength(1);
  });

  it('EV-89 keeps two questions that cite the same range but ask about different things', () => {
    const cards = cardsOf(
      question('Who approves the invoice discount?', macro, 1, 40),
      question('Which rounding applies to the tax total?', macro, 1, 40),
    );

    expect(openQuestionsOf(cards, 'run-1')).toHaveLength(2);
  });

  it('EV-89 keeps two questions that share a subject but not a question word', () => {
    const cards = cardsOf(
      question('Who approves the invoice discount rules?', macro, 1, 9),
      question('When are the invoice discount rules reviewed?', 'Invoice/Other.bas', 1, 9),
    );

    expect(openQuestionsOf(cards, 'run-1')).toHaveLength(2);
  });
});

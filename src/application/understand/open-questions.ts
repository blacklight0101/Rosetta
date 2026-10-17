import type { Card } from '../../domain/cards/card.js';
import type { OpenQuestion } from '../ports/answers-file.js';

// RF-243, RF-240: the open questions of a run as `answers.md` gets them. Stub: the next commit
// merges duplicates, groups the questions by area and orders them by what depends on them.

export function openQuestionsOf(cards: readonly Card[], runKey: string): readonly OpenQuestion[] {
  return cards
    .filter((card) => card.type === 'OQ')
    .map((card) => ({
      cardId: card.id,
      runKey,
      question: card.question ?? card.title,
      context: card.claims[0]?.text ?? '',
    }));
}

import type { Card } from '../../domain/cards/card.js';
import { formatCitation } from '../../domain/cards/citation.js';
import type { OpenQuestion } from '../ports/answers-file.js';

/** One line for `answers.md`: the first citation and claim of the card (DEC-98). */
export function openQuestionOf(card: Card, runKey: string): OpenQuestion {
  const [claim] = card.claims;
  const citation = claim?.citations[0];
  const where = citation === undefined ? '' : `${formatCitation(citation)} `;
  return {
    cardId: card.id,
    runKey,
    question: card.question ?? card.title,
    context: `${where}${claim?.text ?? ''}`.trim(),
  };
}

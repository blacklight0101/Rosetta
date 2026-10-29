import { useRef } from 'preact/hooks';
import type { OpenQuestionRow } from '../api/answers.js';

// RF-646, RF-1007, DEC-154, DEC-179: where the Your questions page lists each question. A question
// goes in the collapsed "Answered" list once a run used its answer; one still open, or whose answer
// is only saved, stays with the questions to answer, where its answer can still be changed. A
// question stays in the list it was first shown in, with its message, while it is saved or reopened,
// until the page is opened again.

type Questions = readonly OpenQuestionRow[];
type Place = 'open' | 'answered';

const placeOf = (question: OpenQuestionRow): Place =>
  question.state === 'Answered' ? 'answered' : 'open';

/** The questions to answer and the answered ones, each in the list it was first shown in. */
export function useQuestionPlaces(questions: Questions): {
  readonly open: Questions;
  readonly answered: Questions;
} {
  const placed = useRef(new Map<string, Place>());
  for (const question of questions) {
    if (!placed.current.has(question.cardId)) {
      placed.current.set(question.cardId, placeOf(question));
    }
  }
  const inList = (place: Place): Questions =>
    questions.filter((question) => placed.current.get(question.cardId) === place);
  return { open: inList('open'), answered: inList('answered') };
}

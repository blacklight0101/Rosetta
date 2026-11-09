import { useRef } from 'preact/hooks';
import { waitsForAnswer, type OpenQuestionRow } from '../api/answers.js';

// RF-646, RF-1007, DEC-154, DEC-179, P8-85: where the Your questions page lists each question. A
// question that waits for an answer is with the questions to answer; one with an answer, saved or
// used by a run, is in the collapsed "Answered" list. A saved answer moves its question there at
// once, and a cleared one moves it back. Each list is in id order (OQ-001, OQ-002, ...), never newest
// first. A question that has just moved is named, so it keeps the message of its save.

type Questions = readonly OpenQuestionRow[];
type Place = 'open' | 'answered';

interface QuestionPlaces {
  readonly open: Questions;
  readonly answered: Questions;
  /** The questions that moved to another list since the page last drew them, by card id. */
  readonly moved: ReadonlySet<string>;
}

const placeOf = (question: OpenQuestionRow): Place =>
  waitsForAnswer(question) ? 'open' : 'answered';

const byId = (a: OpenQuestionRow, b: OpenQuestionRow): number =>
  a.cardId.localeCompare(b.cardId, 'en', { numeric: true });

/** The questions to answer and the ones with an answer, each in id order. */
export function useQuestionPlaces(questions: Questions): QuestionPlaces {
  const placed = useRef(new Map<string, Place>());
  const moved = new Set<string>();
  for (const question of questions) {
    const place = placeOf(question);
    const was = placed.current.get(question.cardId);
    if (was !== undefined && was !== place) moved.add(question.cardId);
    placed.current.set(question.cardId, place);
  }
  const sorted = [...questions].sort(byId);
  const inList = (place: Place): Questions =>
    sorted.filter((question) => placeOf(question) === place);
  return { open: inList('open'), answered: inList('answered'), moved };
}

import { useEffect, useState } from 'preact/hooks';
import { waitsForAnswer } from '../api/answers.js';
import type { AnswersLoad } from './use-run-answers.js';

// RF-615, DEC-154: "Answer N questions" takes the user to the answer field of the first question
// that has no saved answer: it is scrolled into view and focused once the questions are shown, on
// the tab or after the tab opens, and the request is then done.

export interface FocusRequest {
  readonly wanted: boolean;
  readonly done: () => void;
}

// RF-615
export function useFocusFirst(load: AnswersLoad, request: FocusRequest | undefined): void {
  useEffect(() => {
    if (request === undefined || !request.wanted || load.status !== 'ready') return;
    const first = load.questions.find(waitsForAnswer);
    const field = first === undefined ? null : document.getElementById(`answer-${first.cardId}`);
    if (field !== null) {
      if (typeof field.scrollIntoView === 'function') field.scrollIntoView({ block: 'center' });
      field.focus();
    }
    request.done();
  }, [load, request]);
}

/** Shows the Your questions tab (`show`) and asks for the first open question to take focus. */
export function useQuestionsFocus(show: () => void): {
  readonly focus: FocusRequest;
  readonly showQuestions: () => void;
} {
  const [wanted, setWanted] = useState(false);
  return {
    focus: {
      wanted,
      done: () => {
        setWanted(false);
      },
    },
    showQuestions: () => {
      show();
      setWanted(true);
    },
  };
}

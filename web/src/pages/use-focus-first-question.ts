import { useEffect, useState } from 'preact/hooks';
import { waitsForAnswer } from '../api/answers.js';
import type { AnswersLoad } from './use-run-answers.js';

// RF-615, DEC-154: "Answer N questions" takes the user to the answer field of the first question
// that has no saved answer: it is scrolled into view and focused once the questions are shown, on
// the tab or after the tab opens, and the request is then done. A field that mounts after the
// request is waited for, not given up on.

export interface FocusRequest {
  readonly wanted: boolean;
  readonly done: () => void;
}

/** Scrolls the field into view and focuses it; false while the field is not in the page. */
function focusField(id: string): boolean {
  const field = document.getElementById(id);
  if (field === null) return false;
  if (typeof field.scrollIntoView === 'function') field.scrollIntoView({ block: 'center' });
  field.focus();
  return true;
}

// RF-615
export function useFocusFirst(load: AnswersLoad, request: FocusRequest | undefined): void {
  useEffect(() => {
    if (request === undefined || !request.wanted || load.status !== 'ready') return undefined;
    const first = load.questions.find(waitsForAnswer);
    if (first === undefined) {
      request.done();
      return undefined;
    }
    const id = `answer-${first.cardId}`;
    if (focusField(id)) {
      request.done();
      return undefined;
    }
    // The field mounts later than the request (the tab is still opening): wait for it.
    const watch = new MutationObserver(() => {
      if (!focusField(id)) return;
      watch.disconnect();
      request.done();
    });
    watch.observe(document.body, { childList: true, subtree: true });
    return () => {
      watch.disconnect();
    };
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

import { useEffect } from 'preact/hooks';
import type { OpenQuestionRow } from '../api/answers.js';

// RF-1007, P8-85: when a save moves a question to the other list, its Save button unmounts and the
// focus would fall to the page. The focus goes on instead: to the first control of the next
// question that waits for an answer, or to the "Answered" summary when none is left; a question
// that moved back to the ones that wait keeps the focus in its own first control. Focus that is
// already on a control is left where it is. P8-86: after the list's "Save answers" or "Accept the
// recommended answers" the focus goes on in the same way even from the button; when the save moved
// nothing and the busy button let the focus fall to the page, it returns to Save answers.

type Questions = readonly OpenQuestionRow[];

const controlSelector = 'input:not([type="hidden"]), textarea, select, button';

function focusLost(): boolean {
  const active = document.activeElement;
  return active === null || active === document.body;
}

function focusControlOf(cardId: string): boolean {
  const item = document.querySelector(`[data-card-id="${cardId}"]`);
  const control = item?.querySelector<HTMLElement>(controlSelector);
  if (control === null || control === undefined) return false;
  control.focus();
  return true;
}

function focusSaveAnswers(): void {
  document.querySelector<HTMLElement>('[data-testid="save-answers"] button')?.focus();
}

function focusSummary(): void {
  document.querySelector<HTMLElement>('[data-testid="answered-questions"] > summary')?.focus();
}

/** The question after the ones that moved, in id order, else the first that waits. */
function nextOpen(open: Questions, moved: ReadonlySet<string>): OpenQuestionRow | undefined {
  const last = [...moved].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).at(-1) ?? '';
  return open.find((q) => q.cardId.localeCompare(last, 'en', { numeric: true }) > 0) ?? open[0];
}

// RF-1007
export function useFocusAfterMove(
  moved: ReadonlySet<string>,
  open: Questions,
  answered: Questions,
  /** P8-86: set by the list's save; the next draw moves the focus on and clears it. */
  afterSave: { current: boolean },
): void {
  useEffect(() => {
    const saved = afterSave.current;
    afterSave.current = false;
    if (moved.size === 0) {
      if (saved && focusLost()) focusSaveAnswers();
      return;
    }
    if (!saved && !focusLost()) return;
    const back = open.find((question) => moved.has(question.cardId));
    if (back !== undefined && focusControlOf(back.cardId)) return;
    const next = nextOpen(open, moved);
    if (next === undefined || !focusControlOf(next.cardId)) focusSummary();
  }, [moved, open, answered, afterSave]);
}

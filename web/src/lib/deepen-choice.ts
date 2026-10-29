// RF-646, DEC-179: a user who chooses not to Deepen a run is asked to answer its questions at once.
// The choice is a per-viewer convenience kept in the browser (it may be unavailable: the page then
// recommends Deepen again), and the parts of one page hear of a change through an event.

const KEY = 'rosetta.skip-deepen.';
const CHANGED = 'rosetta:skip-deepen';

/** Whether the user chose not to Deepen this run. */
export function skippedDeepen(runId: string): boolean {
  try {
    return window.localStorage.getItem(`${KEY}${runId}`) === '1';
  } catch {
    return false;
  }
}

/** Remembers the choice (or takes it back) and tells the page. */
export function chooseSkipDeepen(runId: string, skip: boolean): void {
  try {
    if (skip) window.localStorage.setItem(`${KEY}${runId}`, '1');
    else window.localStorage.removeItem(`${KEY}${runId}`);
  } catch {
    // The choice then lasts only until the page is read again.
  }
  window.dispatchEvent(new CustomEvent(CHANGED, { detail: { runId, skip } }));
}

/** Calls back when the choice for any run changes; returns the way to stop. */
export function onSkipDeepenChange(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  return () => {
    window.removeEventListener(CHANGED, listener);
  };
}

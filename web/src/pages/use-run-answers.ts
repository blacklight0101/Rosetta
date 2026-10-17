import { useEffect, useState } from 'preact/hooks';
import { getAnswers, type OpenQuestionRow } from '../api/answers.js';
import type { ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';

// RF-1007, RF-241: the open questions of a run, read once the run has ended (a run adds its questions
// to answers.md when it ends, stopped runs included). A re-run started elsewhere marks questions
// Answered, so the page reads them again when it comes back to the front; a later read that fails
// keeps what the page has.

export type AnswersLoad =
  | { readonly status: 'waiting' }
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly questions: readonly OpenQuestionRow[] };

export interface RunAnswersState {
  readonly load: AnswersLoad;
  /** Shows the questions an answer, a save or a reopening returned. */
  readonly apply: (questions: readonly OpenQuestionRow[]) => void;
}

// RF-1007
export function useRunAnswers(runId: string, ended: boolean): RunAnswersState {
  const { client } = useApp();
  const [load, setLoad] = useState<AnswersLoad>({ status: 'waiting' });
  useEffect(() => {
    if (!ended) return undefined;
    const abort = new AbortController();
    const read = (first: boolean): void => {
      if (first) setLoad({ status: 'loading' });
      void getAnswers(client, runId, abort.signal).then((result) => {
        if (abort.signal.aborted) return;
        if (result.ok) setLoad({ status: 'ready', questions: result.value });
        else if (first) setLoad({ status: 'failed', error: result.error });
      });
    };
    const again = (): void => {
      if (document.visibilityState !== 'hidden') read(false);
    };
    read(true);
    window.addEventListener('focus', again);
    document.addEventListener('visibilitychange', again);
    return () => {
      abort.abort();
      window.removeEventListener('focus', again);
      document.removeEventListener('visibilitychange', again);
    };
  }, [client, runId, ended]);
  const apply = (questions: readonly OpenQuestionRow[]): void => {
    setLoad({ status: 'ready', questions });
  };
  return { load, apply };
}

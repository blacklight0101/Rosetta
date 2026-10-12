import { useEffect, useState } from 'preact/hooks';
import { getAnswers, type OpenQuestionRow } from '../api/answers.js';
import type { ApiFailure } from '../api/client.js';
import { useApp } from '../app/app-context.js';

// RF-1007: the open questions of a run, read once the run has ended (a run adds its questions to
// answers.md when it ends, stopped runs included).

export type AnswersLoad =
  | { readonly status: 'waiting' }
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly questions: readonly OpenQuestionRow[] };

// RF-1007
export function useRunAnswers(runId: string, ended: boolean): AnswersLoad {
  const { client } = useApp();
  const [load, setLoad] = useState<AnswersLoad>({ status: 'waiting' });
  useEffect(() => {
    if (!ended) return undefined;
    const abort = new AbortController();
    setLoad({ status: 'loading' });
    void getAnswers(client, runId, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setLoad(
        result.ok
          ? { status: 'ready', questions: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client, runId, ended]);
  return load;
}

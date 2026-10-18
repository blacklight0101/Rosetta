import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { getUnderstanding, type Understanding } from '../api/understanding.js';
import { useApp } from '../app/app-context.js';

// RF-231, RF-209: the understanding of an ended understand run (its honest measures and, for a
// Deepen run, the record of its rounds), read once when the page of the run, or a row of a list,
// shows it. Only an ended understand run has any, so any other page does not ask (`enabled`).

export type UnderstandingLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly understanding: Understanding };

// RF-231
export function useUnderstanding(runId: string, enabled: boolean): UnderstandingLoad {
  const { client } = useApp();
  const [load, setLoad] = useState<UnderstandingLoad>({ status: 'loading' });
  useEffect(() => {
    if (!enabled) return undefined;
    const abort = new AbortController();
    setLoad({ status: 'loading' });
    void getUnderstanding(client, runId, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setLoad(
        result.ok
          ? { status: 'ready', understanding: result.value }
          : { status: 'failed', error: result.error },
      );
    });
    return () => {
      abort.abort();
    };
  }, [client, runId, enabled]);
  return load;
}

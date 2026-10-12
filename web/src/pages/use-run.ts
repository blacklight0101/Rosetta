import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { RunRow } from '../api/run-schemas.js';
import { getRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';

// RF-1002, RF-1105: loads one run of the signed-in user for the live page and reads it again when
// `refreshKey` changes (the page changes it at every model turn, so the cost so far follows the
// run). Another user's run answers 404 like an unknown one. A read that fails after the first keeps
// the last good answer.

export type RunLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly run: RunRow };

// RF-1105
export function useRun(runId: string, refreshKey: number): RunLoad {
  const { client } = useApp();
  const [state, setState] = useState<RunLoad>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    void getRun(client, runId, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      if (result.ok) setState({ status: 'ready', run: result.value });
      else setState((current) => (current.status === 'ready' ? current : failed(result.error)));
    });
    return () => {
      abort.abort();
    };
  }, [client, runId, refreshKey]);
  return state;
}

function failed(error: ApiFailure): RunLoad {
  return { status: 'failed', error };
}

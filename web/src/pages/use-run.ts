import { useEffect, useRef, useState } from 'preact/hooks';
import { eventRefresh } from '../lib/event-refresh.js';
import type { ApiFailure } from '../api/client.js';
import type { RunRow } from '../api/run-schemas.js';
import { getRun } from '../api/runs.js';
import { useApp } from '../app/app-context.js';

// RF-1002, RF-1105: loads one run of the signed-in user for the live page and reads it again when
// `refreshKey` changes, at most once per second (P1-166, RF-1004: a fast run changes it many times a
// second), with one last read after the final change. Another user's run answers 404 like an
// unknown one. A read that fails after the first keeps the last good answer.

export type RunLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly run: RunRow };

/** EV-80: how often a queued run is read again. */
const QUEUE_POLL_MS = 15_000;

// RF-1105
export function useRun(runId: string, refreshKey: number): RunLoad {
  const { client } = useApp();
  const [state, setState] = useState<RunLoad>({ status: 'loading' });
  const refresh = useRef<(() => void) | undefined>(undefined);
  const previous = useRef(refreshKey);
  useEffect(() => {
    const abort = new AbortController();
    const { signal } = abort;
    const updates = eventRefresh(() => {
      void getRun(client, runId, signal).then((result) => {
        if (signal.aborted) return;
        if (result.ok) setState({ status: 'ready', run: result.value });
        else setState((current) => (current.status === 'ready' ? current : failed(result.error)));
      });
    });
    previous.current = refreshKey;
    refresh.current = updates.request;
    return () => {
      updates.dispose();
      abort.abort();
    };
  }, [client, runId]);
  // EV-80: a queued run has no events, so its place is read again while it waits.
  const queued = state.status === 'ready' && state.run.queueState === 'Queued';
  useEffect(() => {
    if (!queued) return undefined;
    const timer = setInterval(() => {
      refresh.current?.();
    }, QUEUE_POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [queued]);
  useEffect(() => {
    if (previous.current === refreshKey) return;
    previous.current = refreshKey;
    refresh.current?.();
  }, [refreshKey]);
  return state;
}

function failed(error: ApiFailure): RunLoad {
  return { status: 'failed', error };
}

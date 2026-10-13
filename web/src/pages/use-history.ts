import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import { getHistory } from '../api/history.js';
import type { RunHistory } from '../api/history-schemas.js';
import { useApp } from '../app/app-context.js';

// RF-1008, RF-1105: loads the history of one of the signed-in user's projects and reads it again
// every few seconds while a run is queued or running, so the state, tokens and cost follow the run.
// Another user's project answers 404 like an unknown one.

const pollMs = 5000;

export type HistoryLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly history: RunHistory };

const inProgress = (history: RunHistory): boolean =>
  history.runs.some((run) => run.queueState !== 'Ended');

// RF-1008
export function useHistory(projectId: string): {
  readonly state: HistoryLoad;
  /** Forgets a deleted run and the bytes it freed. */
  readonly forget: (runId: string, freedBytes: number) => void;
} {
  const { client } = useApp();
  const [state, setState] = useState<HistoryLoad>({ status: 'loading' });
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (): Promise<void> => {
      const result = await getHistory(client, projectId, abort.signal);
      if (abort.signal.aborted) return;
      setState((current) => {
        if (result.ok) return { status: 'ready', history: result.value };
        return current.status === 'ready' ? current : { status: 'failed', error: result.error };
      });
      if (result.ok && inProgress(result.value)) timer = setTimeout(() => void load(), pollMs);
    };
    setState({ status: 'loading' });
    void load();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [client, projectId]);
  const forget = (runId: string, freedBytes: number): void => {
    setState((current) => {
      if (current.status !== 'ready') return current;
      const { project, runs } = current.history;
      const left = Math.max(0, project.sizeBytes - freedBytes);
      const kept = runs.filter((run) => run.id !== runId);
      return {
        status: 'ready',
        history: { project: { ...project, sizeBytes: left }, runs: kept },
      };
    });
  };
  return { state, forget };
}

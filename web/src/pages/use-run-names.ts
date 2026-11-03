import { useEffect, useState } from 'preact/hooks';
import { getHistory } from '../api/history.js';
import { useApp } from '../app/app-context.js';

// RF-428, RF-1008: the names History gives the runs of a project (their folder names, for example
// `20261102-183533-understand`), by run id, so the cost page names a run as History does. Null
// while they load; empty when History cannot be read, and the page then falls back to the run id.

export function useRunNames(projectId: string): ReadonlyMap<string, string> | null {
  const { client } = useApp();
  const [names, setNames] = useState<ReadonlyMap<string, string> | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    setNames(null);
    void getHistory(client, projectId, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setNames(new Map(result.ok ? result.value.runs.map((run) => [run.id, run.runId]) : []));
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId]);
  return names;
}

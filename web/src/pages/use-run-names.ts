import { useEffect, useState } from 'preact/hooks';
import { getHistory } from '../api/history.js';
import { useApp } from '../app/app-context.js';
import { runKindText } from '../lib/run-kind.js';

// RF-428, RF-1008, P8-109: what History says of the runs of a project, by run id, so the cost page names a
// run as History does: its name (the folder name, for example `20261102-183533-understand`) and its Kind
// in History's words (`Deepen, 3 rounds`). Null while they load; empty when History cannot be read, and
// the page then falls back to the run id and a dash for the Kind.

export interface HistoryRunName {
  readonly name: string;
  readonly kind: string;
}

export function useRunNames(projectId: string): ReadonlyMap<string, HistoryRunName> | null {
  const { client } = useApp();
  const [names, setNames] = useState<ReadonlyMap<string, HistoryRunName> | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    setNames(null);
    void getHistory(client, projectId, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      setNames(
        new Map(
          result.ok
            ? result.value.runs.map((run) => [
                run.id,
                { name: run.runId, kind: runKindText(run.stage, run.deepenRounds) },
              ])
            : [],
        ),
      );
    });
    return () => {
      abort.abort();
    };
  }, [client, projectId]);
  return names;
}

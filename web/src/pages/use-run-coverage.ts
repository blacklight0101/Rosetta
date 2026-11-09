import { useEffect, useState } from 'preact/hooks';
import { getRunCoverage, type CoverageListing } from '../api/coverage.js';
import { useApp } from '../app/app-context.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-230, RF-1005: the files of every area of an understand run with the lines read, from the run's
// `coverage.json`, so the coverage map can show the files and areas nobody read. Read again each
// time `version` changes (the run writes the file after every task that ends); when the server
// cannot answer, the map shows the reads of the page alone and the load says it failed (P8-93: the
// page then gives no verdict on how much of an area was read).

/** How many agents have ended: the run rewrites its coverage file each time a task ends. */
export function endedAgents(state: Pick<RunState, 'agents'>): number {
  return state.agents.filter((agent) => agent.state !== 'Planned' && agent.state !== 'Running')
    .length;
}

export type CoverageLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed' }
  | { readonly status: 'ready'; readonly listing: CoverageListing };

// RF-230
export function useRunCoverage(
  runId: string,
  stage: string | undefined,
  version: number,
): CoverageLoad {
  const { client } = useApp();
  const [load, setLoad] = useState<CoverageLoad>({ status: 'loading' });
  useEffect(() => {
    if (stage !== 'understand') return undefined;
    const abort = new AbortController();
    void getRunCoverage(client, runId, abort.signal).then((result) => {
      if (abort.signal.aborted) return;
      // A listing already read stays when a later read fails: it is only older.
      if (result.ok) setLoad({ status: 'ready', listing: result.value });
      else setLoad((before) => (before.status === 'ready' ? before : { status: 'failed' }));
    });
    return () => {
      abort.abort();
    };
  }, [client, runId, stage, version]);
  return load;
}

import { useEffect, useState } from 'preact/hooks';
import { getRunCoverage, type CoverageListing } from '../api/coverage.js';
import { useApp } from '../app/app-context.js';
import type { RunState } from '../lib/live-run/run-state.js';

// RF-230, RF-1005: the files of every area of an understand run with the lines read, from the run's
// `coverage.json`, so the coverage map can show the files and areas nobody read. Read again each
// time `version` changes (the run writes the file after every task that ends); when the server
// cannot answer, the map shows the reads of the page alone.

/** How many agents have ended: the run rewrites its coverage file each time a task ends. */
export function endedAgents(state: Pick<RunState, 'agents'>): number {
  return state.agents.filter((agent) => agent.state !== 'Planned' && agent.state !== 'Running')
    .length;
}

// RF-230
export function useRunCoverage(
  runId: string,
  stage: string | undefined,
  version: number,
): CoverageListing | undefined {
  const { client } = useApp();
  const [listing, setListing] = useState<CoverageListing | undefined>();
  useEffect(() => {
    if (stage !== 'understand') return undefined;
    const abort = new AbortController();
    void getRunCoverage(client, runId, abort.signal).then((result) => {
      if (!abort.signal.aborted && result.ok) setListing(result.value);
    });
    return () => {
      abort.abort();
    };
  }, [client, runId, stage, version]);
  return listing;
}

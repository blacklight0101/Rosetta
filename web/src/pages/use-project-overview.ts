import { useEffect, useState } from 'preact/hooks';
import type { ApiFailure } from '../api/client.js';
import type { ProjectOverviewRow } from '../api/overview-schemas.js';
import type { Project } from '../api/project-schemas.js';
import { listProjectOverview } from '../api/projects.js';
import { useApp } from '../app/app-context.js';
import { zeroTotals } from '../lib/cost-text.js';

// RF-1008, RF-1108, RF-1105: loads the signed-in user's projects with their run count, totals and
// latest run, and reads them again every few seconds while a latest run is queued or running, so
// the state and the queue position follow the server. A later read that fails keeps the rows the
// page has. `reload` reads at once (after a cancel); `add` lists a project just created.

const pollMs = 5000;

export type OverviewLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'failed'; readonly error: ApiFailure }
  | { readonly status: 'ready'; readonly rows: readonly ProjectOverviewRow[] };

const inProgress = (rows: readonly ProjectOverviewRow[]): boolean =>
  rows.some((row) => row.lastRun !== null && row.lastRun.queueState !== 'Ended');

// RF-1008
export function useProjectOverview(): {
  readonly state: OverviewLoad;
  readonly add: (project: Project) => void;
  readonly reload: () => void;
} {
  const { client } = useApp();
  const [state, setState] = useState<OverviewLoad>({ status: 'loading' });
  const [reads, setReads] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async (): Promise<void> => {
      const result = await listProjectOverview(client, abort.signal);
      if (abort.signal.aborted) return;
      setState((current) => {
        if (result.ok) return { status: 'ready', rows: result.value };
        return current.status === 'ready' ? current : { status: 'failed', error: result.error };
      });
      if (result.ok && inProgress(result.value)) timer = setTimeout(() => void load(), pollMs);
    };
    void load();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [client, reads]);
  const add = (project: Project): void => {
    const row: ProjectOverviewRow = { project, runs: 0, totals: zeroTotals, lastRun: null };
    setState((current) => ({
      status: 'ready',
      rows: current.status === 'ready' ? [...current.rows, row] : [row],
    }));
  };
  const reload = (): void => {
    setReads((count) => count + 1);
  };
  return { state, add, reload };
}

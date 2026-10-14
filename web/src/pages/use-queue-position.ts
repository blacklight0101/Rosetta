import { useEffect, type Dispatch, type StateUpdater } from 'preact/hooks';
import { getRun } from '../api/runs.js';
import type { RunRow } from '../api/run-schemas.js';
import { useApp } from '../app/app-context.js';
import type { RunNoticeState } from './RunNotice.js';

// RF-1108, RF-1001 (P1-106): while the start page's notice says the run is queued, the page reads
// the run again every few seconds and keeps the notice true: the place moves up as the runs ahead of
// it end; a run that began becomes "started" (with its link to the live page); a run that ended
// without ever starting was stopped elsewhere, so the notice says it was cancelled. A read that
// fails keeps what the page shows and tries again. Reading stops with the page, and with the notice
// once it is no longer queued.

/** How often the queued notice reads the run again. */
const POLL_MS = 2000;

type SetNotice = Dispatch<StateUpdater<RunNoticeState | undefined>>;

/** The notice for a run that is no longer queued, or undefined while it still is. */
function leftQueue(run: RunRow): RunNoticeState | undefined {
  if (run.queueState === 'Queued') return undefined;
  if (run.queueState === 'Ended' && run.startedAt === null) return { kind: 'cancelled' };
  return { kind: 'started', stage: run.stage, runId: run.id };
}

function movedTo(
  position: number | null,
): (notice: RunNoticeState | undefined) => RunNoticeState | undefined {
  return (notice) =>
    notice?.kind === 'queued' && position !== null ? { ...notice, position } : notice;
}

// RF-1108
export function useQueuePosition(notice: RunNoticeState | undefined, setNotice: SetNotice): void {
  const { client } = useApp();
  const runId = notice?.kind === 'queued' ? notice.runId : undefined;
  useEffect(() => {
    if (runId === undefined) return undefined;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (): Promise<void> => {
      const result = await getRun(client, runId, abort.signal);
      if (abort.signal.aborted) return;
      const left = result.ok ? leftQueue(result.value) : undefined;
      if (left !== undefined) {
        setNotice(left);
        return;
      }
      if (result.ok) setNotice(movedTo(result.value.position));
      timer = setTimeout(() => void tick(), POLL_MS);
    };
    timer = setTimeout(() => void tick(), POLL_MS);
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [client, runId, setNotice]);
}

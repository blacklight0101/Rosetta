import { useLayoutEffect, type Dispatch, type StateUpdater } from 'preact/hooks';
import { getRun } from '../api/runs.js';
import type { RunRow } from '../api/run-schemas.js';
import { useApp } from '../app/app-context.js';
import type { RunNoticeState } from './RunNotice.js';

// RF-1108, RF-1001 (P1-106, P1-163): while the start page's notice says the run is queued, the page
// reads the run again and keeps the notice true: the place moves up as the runs ahead of it end; a
// run that began becomes "started" (with its link to the live page); a run that ended without ever
// starting was stopped elsewhere, so the notice says it was cancelled. The reads wait 2 s, then 4,
// 8 and 16 s, then 30 s each time. A read that fails keeps what the page shows and tries again.
// Reading pauses while the page is hidden and goes on at once when it is shown. Reading stops with
// the page, and with the notice once it is no longer queued.

/** The first wait between two reads of the queued run. */
const POLL_MS = 2000;
/** The longest wait between two reads of the queued run. */
const POLL_MAX_MS = 30_000;

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
  // A layout effect: its cleanup (timer, listener, read) runs as the page is left, not after paint.
  useLayoutEffect(() => {
    if (runId === undefined) return undefined;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let wait = POLL_MS;
    let busy = false;
    const stopTimer = (): void => {
      clearTimeout(timer);
      timer = undefined;
    };
    const schedule = (): void => {
      if (document.hidden) return;
      timer = setTimeout(() => void tick(), wait);
      wait = Math.min(wait * 2, POLL_MAX_MS);
    };
    const tick = async (): Promise<void> => {
      timer = undefined;
      if (document.hidden) return;
      busy = true;
      const result = await getRun(client, runId, abort.signal);
      busy = false;
      if (abort.signal.aborted) return;
      const left = result.ok ? leftQueue(result.value) : undefined;
      if (left !== undefined) {
        setNotice(left);
        return;
      }
      if (result.ok) setNotice(movedTo(result.value.position));
      schedule();
    };
    const onVisibility = (): void => {
      if (document.hidden) {
        stopTimer();
        return;
      }
      if (timer === undefined && !busy) void tick();
    };
    document.addEventListener('visibilitychange', onVisibility);
    schedule();
    return () => {
      abort.abort();
      stopTimer();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [client, runId, setNotice]);
}

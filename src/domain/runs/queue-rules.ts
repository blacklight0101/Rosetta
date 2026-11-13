import type { Run } from './run.js';

// RF-1108, DEC-61: the rules of the run queue. More running runs than the limit wait; one user has
// at most one running run; a run starts when a slot frees, in the order the runs were queued. A
// user's second run waits without holding up the next user's first run. A scan calls no model and
// costs nothing, so it is outside the one-run-per-user rule (EV-91, P8-10): it starts beside the
// user's paid run, and a running scan does not hold back the user's next paid run. It still counts
// against the limit of running runs.

/** Queue order: the time the run was queued, then its id so that two runs never tie. */
export function inQueueOrder(left: Run, right: Run): number {
  if (left.queuedAt !== right.queuedAt) return left.queuedAt - right.queuedAt;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

/** A scan calls no model; every other stage may spend money, so it waits in the user's queue. */
const isPaid = (run: Run): boolean => run.stage !== 'scan';

/** The queued runs that may start now, in queue order. */
// RF-1108
export function runsToStart(
  queued: readonly Run[],
  running: readonly Run[],
  limit: number,
): readonly Run[] {
  const busyUsers = new Set(running.filter(isPaid).map((run) => run.userId));
  const chosen: Run[] = [];
  for (const run of [...queued].sort(inQueueOrder)) {
    if (running.length + chosen.length >= limit) break;
    if (isPaid(run)) {
      if (busyUsers.has(run.userId)) continue;
      busyUsers.add(run.userId);
    }
    chosen.push(run);
  }
  return chosen;
}

/** Each queued run's position, counted from 1 in queue order. */
// RF-1108
export function queuePositions(queued: readonly Run[]): ReadonlyMap<string, number> {
  return new Map([...queued].sort(inQueueOrder).map((run, index) => [run.id, index + 1]));
}

/** The running paid run of the same user that holds a queued paid run back; none for a scan. */
// RF-1108, EV-106
export function holdingRunOf(
  queued: readonly Run[],
  running: readonly Run[],
  runId: string,
): Run | undefined {
  const waiting = queued.find((run) => run.id === runId);
  return running.find((run) => run.id === runId && waiting !== undefined);
}

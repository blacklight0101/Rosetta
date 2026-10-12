import type { Run } from './run.js';

// RF-1108, DEC-61: the rules of the run queue. More running runs than the limit wait; one user has
// at most one running run; a run starts when a slot frees, in the order the runs were queued. A
// user's second run waits without holding up the next user's first run.

/** Queue order: the time the run was queued, then its id so that two runs never tie. */
export function inQueueOrder(left: Run, right: Run): number {
  if (left.queuedAt !== right.queuedAt) return left.queuedAt - right.queuedAt;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}

/** The queued runs that may start now, in queue order. */
// RF-1108
export function runsToStart(
  queued: readonly Run[],
  running: readonly Run[],
  limit: number,
): readonly Run[] {
  const busyUsers = new Set(running.map((run) => run.userId));
  const chosen: Run[] = [];
  for (const run of [...queued].sort(inQueueOrder)) {
    if (running.length + chosen.length >= limit) break;
    if (busyUsers.has(run.userId)) continue;
    busyUsers.add(run.userId);
    chosen.push(run);
  }
  return chosen;
}

/** Each queued run's position, counted from 1 in queue order. */
// RF-1108
export function queuePositions(queued: readonly Run[]): ReadonlyMap<string, number> {
  return new Map([...queued].sort(inQueueOrder).map((run, index) => [run.id, index + 1]));
}

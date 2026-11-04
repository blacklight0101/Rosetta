import type { Run } from './run.js';

// RF-006, RF-1008, P8-88: what a run's times say once it has ended. The running time is the sum of
// the spans in which the run was running; the wall time runs from its first start to its end, so a
// run that was stopped and resumed reads the first as shorter than the second.

export interface RunTimes {
  readonly runningMs: number;
  readonly wallMs: number;
}

/** The two times of an ended run that started; null for any other run. */
// RF-1008
export function runTimesOf(run: Run): RunTimes | null {
  if (run.queueState !== 'Ended' || run.startedAt === null || run.endedAt === null) return null;
  return { runningMs: run.activeMs, wallMs: Math.max(0, run.endedAt - run.startedAt) };
}

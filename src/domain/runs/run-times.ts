import type { Run } from './run.js';

// RF-1008, P8-88: skeleton, filled in by the next commit.

export interface RunTimes {
  readonly runningMs: number;
  readonly wallMs: number;
}

export function runTimesOf(run: Run): RunTimes | null {
  return run.endedAt === null ? null : null;
}

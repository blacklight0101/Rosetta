import type { ErrorCode } from '../../domain/errors/codes.js';
import type { AgentTaskState } from '../../domain/runs/run-states.js';

// RF-208, RF-230: an area is failed when its task ended without a usable card for a reason other
// than a finished, empty reading. The coverage and the run end say so and why, so a run in which
// areas are missing from the specification is never taken for a plain success.

export interface TaskEndFacts {
  readonly state: Exclude<AgentTaskState, 'Planned' | 'Running'>;
  readonly code?: ErrorCode;
  readonly drafts: readonly unknown[];
}

const reasons: Readonly<Partial<Record<TaskEndFacts['state'], string>>> = {
  InvalidOutput: 'invalid output',
  Failed: 'failed',
  TurnLimitReached: 'turn limit reached without a card',
  StoppedByCap: 'stopped by a cap without a card',
};

/** Why the area failed, in a few words with the error code, or undefined when it did not. */
// RF-208
export function areaFailureOf(end: TaskEndFacts): string | undefined {
  if (end.drafts.length > 0) return undefined;
  const reason = reasons[end.state];
  if (reason === undefined) return undefined;
  return end.code === undefined ? reason : `${reason} (${end.code})`;
}

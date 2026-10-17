import type { EpochMs } from '../accounts/user.js';
import { err, ok, type Result } from '../errors/result.js';
import type { RunEndState, RunQueueState, RunStage } from './run-states.js';

// Architecture section 5 (`Run`, `RunQueueState`), data-model.md section 4 (`runs`), RF-003,
// RF-1108: a run is one stage of one project. It is queued, then running, then ended; the end
// state is recorded when it ends and never changes. A queued run that is cancelled ends as
// `Interrupted` without ever running. Instants are epoch milliseconds from the Clock port.

/** The running totals shown in lists; the cost ledger is the source of truth (DEC-55). */
export interface RunTotals {
  readonly costMicros: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
}

export interface Run {
  /** The identity in URLs and rows. */
  readonly id: string;
  readonly projectId: string;
  /** The owner of the project; every query is scoped by it (RF-1105). */
  readonly userId: string;
  /** The folder name `yyyyMMdd-HHmmss-<stage>`, unique per project; the `runId` of files and events. */
  readonly runKey: string;
  readonly stage: RunStage;
  /** The pinned commit and the snapshot folder name, known once the source is resolved. */
  readonly commitSha: string | null;
  readonly snapshotKey: string | null;
  readonly queueState: RunQueueState;
  /** Set exactly when `queueState` is `Ended`. */
  readonly endState: RunEndState | null;
  readonly queuedAt: EpochMs;
  readonly startedAt: EpochMs | null;
  readonly endedAt: EpochMs | null;
  readonly totals: RunTotals;
  /** RF-208: the areas of an understand run that gave no usable card; 0 for any other run. */
  readonly failedAreas: number;
}

export type StartProblem = 'not-queued';
export type ReopenProblem = 'not-resumable';
export type EndProblem = 'already-ended' | 'queued-run-can-only-be-interrupted';

// RF-1108
export function startRun(run: Run, at: EpochMs): Result<Run, StartProblem> {
  if (run.queueState !== 'Queued') return err('not-queued');
  return ok({ ...run, queueState: 'Running', startedAt: at });
}

// RF-003, RF-1108
export function endRun(
  run: Run,
  endState: RunEndState,
  at: EpochMs,
  failedAreas = 0,
): Result<Run, EndProblem> {
  if (run.queueState === 'Ended') return err('already-ended');
  if (run.queueState === 'Queued' && endState !== 'Interrupted') {
    return err('queued-run-can-only-be-interrupted');
  }
  return ok({ ...run, queueState: 'Ended', endState, endedAt: at, failedAreas });
}

/** RF-006: the end states a resume can start from; a `Completed` run has nothing left to do. */
export const RESUMABLE_END_STATES: readonly RunEndState[] = ['CapReached', 'Failed', 'Interrupted'];

/**
 * RF-006: an ended run that stopped at a cap, failed or was interrupted queues again as the same
 * run (same folder, same manifest), its totals kept; the end state is cleared and set again when
 * it ends.
 */
// RF-006
export function reopenRun(run: Run, at: EpochMs): Result<Run, ReopenProblem> {
  if (run.queueState !== 'Ended' || run.endState === null) return err('not-resumable');
  if (!RESUMABLE_END_STATES.includes(run.endState)) return err('not-resumable');
  return ok({
    ...run,
    queueState: 'Queued',
    endState: null,
    queuedAt: at,
    startedAt: null,
    endedAt: null,
  });
}

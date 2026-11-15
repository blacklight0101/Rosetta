import type { EpochMs } from '../accounts/user.js';
import { err, ok, type Result } from '../errors/result.js';
import type { RunEndReason, RunEndState, RunQueueState, RunStage } from './run-states.js';

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
  /** P8-88: the first start; a resume or Continue keeps it. Null until the run first starts. */
  readonly startedAt: EpochMs | null;
  /** P8-88: the start of the span the run is running in; null while it is queued, paused or ended. */
  readonly spanStartedAt: EpochMs | null;
  /** P8-88: the milliseconds of the spans the run has finished; its running time once it ended. */
  readonly activeMs: number;
  readonly endedAt: EpochMs | null;
  readonly totals: RunTotals;
  /** RF-208: the areas of an understand run that gave no usable card; 0 for any other run. */
  readonly failedAreas: number;
  /** P7-02: the planned areas of an understand run that no reader started (shown as "Partly read"); 0 for any other run. */
  readonly unreadAreas: number;
  /** P8-111: why a run that ended `Interrupted` ended; null for any other run and for one with no recorded reason. */
  readonly endReason: RunEndReason | null;
  /** P8-139, DEC-226: the run a Deepen improves, recorded when it is queued; absent for any other run. */
  readonly deepenParentId?: string;
  /** P8-139: the folder name of the understand run a plan run is written from; absent until known. */
  readonly planSourceKey?: string;
  /** P8-139: the `RST` code the run's `run.ended` event said; absent when it said none. */
  readonly endCode?: string;
  /** P8-139: the Supported claims of an understand run that ended `Completed` or `CapReached`. */
  readonly supportedClaims?: number;
  /** P8-139: the open questions of the understand run's family (RF-646), the same on every run of it. */
  readonly openQuestions?: number;
}

/** RF-208, P7-02: the area counts an understand run ends with. */
export interface AreaCounts {
  readonly failedAreas?: number;
  readonly unreadAreas?: number;
}

/** What a run records besides its end state when it ends: the area counts and, if interrupted, why (P8-111). */
export interface RunEndDetail extends AreaCounts {
  readonly endReason?: RunEndReason;
  /**
   * P8-122: the last instant the run is known to have been alive. The span the run ended in counts
   * only up to it, so the time a server was down is not running time (orphan recovery).
   */
  readonly activeUntil?: EpochMs;
}

export type StartProblem = 'not-queued';
export type ReopenProblem = 'not-resumable';
export type EndProblem =
  'already-ended' | 'queued-run-can-only-be-interrupted' | 'awaiting-run-can-only-be-stopped';
export type PauseProblem = 'not-running';
export type ContinueProblem = 'not-awaiting-approval';

/** P8-88: the run's finished spans with the one it is running in, closed at `at`. */
function activeAt(run: Run, at: EpochMs): number {
  return run.activeMs + (run.spanStartedAt === null ? 0 : Math.max(0, at - run.spanStartedAt));
}

// RF-1108, P8-88
export function startRun(run: Run, at: EpochMs): Result<Run, StartProblem> {
  if (run.queueState !== 'Queued') return err('not-queued');
  return ok({ ...run, queueState: 'Running', startedAt: run.startedAt ?? at, spanStartedAt: at });
}

function endProblemOf(run: Run, endState: RunEndState): EndProblem | undefined {
  if (run.queueState === 'Ended') return 'already-ended';
  if (run.queueState === 'Queued' && endState !== 'Interrupted') {
    return 'queued-run-can-only-be-interrupted';
  }
  // RF-432: Stop here ends a paused run `CapReached`; a cancel or a removal ends it `Interrupted`.
  const stopsOnly = endState !== 'CapReached' && endState !== 'Interrupted';
  return run.queueState === 'AwaitingApproval' && stopsOnly
    ? 'awaiting-run-can-only-be-stopped'
    : undefined;
}

/**
 * P8-111: only an interrupted run has a reason, except for the stop at the approval pause, which is
 * the reason of a `CapReached` run alone (P9-03).
 */
function endReasonOf(endState: RunEndState, reason: RunEndReason | undefined): RunEndReason | null {
  if (reason === undefined) return null;
  const atApproval = reason === 'StoppedAtApproval';
  if (endState === 'Interrupted') return atApproval ? null : reason;
  return endState === 'CapReached' && atApproval ? reason : null;
}

// RF-003, RF-1108
export function endRun(
  run: Run,
  endState: RunEndState,
  at: EpochMs,
  detail: RunEndDetail = {},
): Result<Run, EndProblem> {
  const problem = endProblemOf(run, endState);
  if (problem !== undefined) return err(problem);
  return ok({
    ...run,
    queueState: 'Ended',
    endState,
    endedAt: at,
    spanStartedAt: null,
    activeMs: activeAt(run, Math.min(at, detail.activeUntil ?? at)),
    failedAreas: detail.failedAreas ?? 0,
    unreadAreas: detail.unreadAreas ?? 0,
    endReason: endReasonOf(endState, detail.endReason),
  });
}

/**
 * RF-432, ADR-026: a running run that neared its approved amount waits for its owner's answer. It
 * keeps its record, its totals and the areas no reader started; it holds no running slot.
 */
// RF-432
export function pauseRun(
  run: Run,
  at: EpochMs,
  counts: AreaCounts = {},
): Result<Run, PauseProblem> {
  if (run.queueState !== 'Running') return err('not-running');
  return ok({
    ...run,
    queueState: 'AwaitingApproval',
    unreadAreas: counts.unreadAreas ?? 0,
    spanStartedAt: null,
    activeMs: activeAt(run, at),
  });
}

/** RF-432, RF-006: Continue queues the paused run again at the end of the queue, as a resume does. */
// RF-432
export function continueRun(run: Run, at: EpochMs): Result<Run, ContinueProblem> {
  if (run.queueState !== 'AwaitingApproval') return err('not-awaiting-approval');
  return ok({ ...run, queueState: 'Queued', unreadAreas: 0, queuedAt: at });
}

/** RF-006: the end states a resume can start from; a `Completed` run has nothing left to do. */
export const RESUMABLE_END_STATES: readonly RunEndState[] = ['CapReached', 'Failed', 'Interrupted'];

/** P7-26: the end states from which the overview alone can be written again. */
export const OVERVIEW_END_STATES: readonly RunEndState[] = ['CapReached', 'Completed'];

/**
 * RF-006: an ended run that stopped at a cap, failed or was interrupted queues again as the same
 * run (same folder, same manifest), its totals kept; the end state is cleared and set again when
 * it ends.
 */
// RF-006
export function reopenRun(
  run: Run,
  at: EpochMs,
  states: readonly RunEndState[] = RESUMABLE_END_STATES,
): Result<Run, ReopenProblem> {
  if (run.queueState !== 'Ended' || run.endState === null) return err('not-resumable');
  if (!states.includes(run.endState)) return err('not-resumable');
  return ok({
    ...run,
    queueState: 'Queued',
    endState: null,
    failedAreas: 0,
    unreadAreas: 0,
    endReason: null,
    queuedAt: at,
    endedAt: null,
  });
}

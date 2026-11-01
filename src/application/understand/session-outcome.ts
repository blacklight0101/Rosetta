import type { CardDraft } from '../../domain/cards/card-ids.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { AreaRead } from '../agent/agent-task-result.js';
import type { OutputProblem } from '../cards/output-problem.js';
import type { RunOutcome } from '../ports/run-executor.js';
import { areaFailureOf, type TaskEndFacts } from './area-failure.js';

// RF-1108, RF-208, RF-423, RF-006: how a reader task ended, and how an understand run ends from how
// its reader tasks ended.

/** How a task ended, as far as the run's outputs are concerned. */
export interface TaskOutcome extends TaskEndFacts {
  readonly turns: number;
  readonly drafts: readonly CardDraft[];
  readonly rawOutputs: readonly string[];
  /** What was dropped from the answer (RF-208), or why the answer was not usable. */
  readonly problems: readonly OutputProblem[];
  /** RF-206: whether the task read a file of its area; absent when the task failed. */
  readonly areaRead?: AreaRead;
}

export function failedOutcome(error: unknown): TaskOutcome {
  const code = error instanceof RosettaError ? error.code : ERROR_CODES.providerCallFailed;
  return { state: 'Failed', code, turns: 0, drafts: [], rawOutputs: [], problems: [] };
}

interface SessionEnd {
  /** The run's signal was aborted: a stop by the user, shutdown or a run-wide cap. */
  readonly aborted: boolean;
  /** The code of a card output that could not be written (RNF-002). */
  readonly outputFailure: ErrorCode | undefined;
  readonly ends: readonly TaskEndFacts[];
  /** RF-006: a resume kept the results of tasks that ended in an earlier run. */
  readonly resumed: boolean;
  /** P5-20: the readers stopped because their own share of a cap had no room left (RF-429). */
  readonly readersFull?: boolean;
  /** P7-02: planned areas (not of third-party code) no reader started. */
  readonly unreadAreas?: number;
}

/** RF-423, P7-02: a role cap, the readers' share or planned areas left unread end the run short. */
function stoppedShort(end: SessionEnd, unreadAreas: number): boolean {
  return (
    end.readersFull === true ||
    unreadAreas > 0 ||
    end.ends.some((each) => each.state === 'StoppedByCap')
  );
}

/**
 * RF-1108, RF-208: stopped runs are `Interrupted`; a run whose every task failed is `Failed`; one
 * with areas that gave no card is `Completed` as before and says how many (`failedAreas`), so it is
 * never shown as a plain success. RF-423: a role that reached its cap stops without stopping the
 * run, so a run with a task stopped by a cap and no run-wide stop still ends `CapReached`: it did
 * not read everything it was asked to. P5-20: readers that stopped to leave room to judge the claims
 * written are no cap stop of the run (the caller leaves their tasks out of `ends`); readers that
 * stopped at their own share still are.
 */
// RF-1108, RF-208
export function sessionOutcome(end: SessionEnd): RunOutcome {
  // P7-02, DEC-194: planned areas no reader started; the run did not read what it was asked to.
  const count = end.unreadAreas ?? 0;
  const unread = count > 0 ? { unreadAreas: count } : {};
  if (end.aborted) return { endState: 'Interrupted', ...unread };
  if (end.outputFailure !== undefined) return { endState: 'Failed', errorCode: end.outputFailure };
  if (stoppedShort(end, count)) {
    return { endState: 'CapReached', errorCode: ERROR_CODES.budgetCapReached, ...unread };
  }
  return failuresOutcome(end);
}

/** RF-208, RF-006: how a run that was not stopped short ends, from the areas that gave no card. */
function failuresOutcome(end: SessionEnd): RunOutcome {
  const { ends } = end;
  const failed = ends.filter((each) => areaFailureOf(each) !== undefined);
  if (failed.length === 0) return { endState: 'Completed' };
  // RF-006: a resume that kept finished tasks did not fail as a whole.
  if (end.resumed || !ends.every((each) => each.state === 'Failed')) {
    return { endState: 'Completed', failedAreas: failed.length };
  }
  const code = ends.find((each) => each.code !== undefined)?.code;
  return code === undefined ? { endState: 'Failed' } : { endState: 'Failed', errorCode: code };
}

/** P7-26: a run that wrote its overview alone ends CapReached while it has areas unread or claims not judged. */
export function overviewOnlyOutcome(unread: number, unjudged: number, capped = false): RunOutcome {
  if (unread === 0 && unjudged === 0 && !capped) return { endState: 'Completed' };
  const left = unread > 0 ? { unreadAreas: unread } : {};
  return { endState: 'CapReached', errorCode: ERROR_CODES.budgetCapReached, ...left };
}

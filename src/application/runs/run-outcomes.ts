import { isCapStop } from '../../domain/budget/cap-stop.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunOutcome } from '../ports/run-executor.js';
import type { EndDetail } from './run-lifecycle.js';

// RF-422, RF-432, RF-208, RNF-002: how the run queue reads the outcome of a run: the end state a
// stop gives, what `run.ended` carries and the end of a paused run that its owner stops.

/**
 * RF-422, RNF-002: a run stopped by a cap ends `CapReached` whatever the executor reports; any other
 * stop is not a failure, so the executor's abort error must not turn it into `Failed`.
 */
export function stoppedOutcome(signal: AbortSignal, outcome: RunOutcome): RunOutcome {
  if (!signal.aborted) return outcome;
  if (isCapStop(signal.reason)) {
    const unread = outcome.unreadAreas === undefined ? {} : { unreadAreas: outcome.unreadAreas };
    return { endState: 'CapReached', errorCode: ERROR_CODES.budgetCapReached, ...unread };
  }
  return outcome.endState === 'Failed' ? { endState: 'Interrupted' } : outcome;
}

/** The parts of the outcome `run.ended` carries besides the end state (RF-208). */
export function endDetailOf(outcome: RunOutcome): EndDetail {
  const { errorCode, failedAreas, unreadAreas } = outcome;
  return {
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(failedAreas === undefined ? {} : { failedAreas }),
    ...(unreadAreas === undefined || outcome.endState !== 'CapReached' ? {} : { unreadAreas }),
  };
}

/** RF-432: what `run.ended` of a paused run that is stopped says, as at a cap (RF-422). */
export function pausedEnd(run: Run): EndDetail {
  return { errorCode: ERROR_CODES.budgetCapReached, unreadAreas: run.unreadAreas };
}

export function failureOf(error: unknown): RunOutcome {
  const errorCode = error instanceof RosettaError ? error.code : ERROR_CODES.unexpected;
  return { endState: 'Failed', errorCode };
}

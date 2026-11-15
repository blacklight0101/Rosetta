import { isCapStop } from '../../domain/budget/cap-stop.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunEndReason } from '../../domain/runs/run-states.js';
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
export function endDetailOf(outcome: RunOutcome, endReason?: RunEndReason): EndDetail {
  const { errorCode, failedAreas, unreadAreas } = outcome;
  return {
    ...(endReason === undefined ? {} : { endReason }),
    ...(errorCode === undefined ? {} : { errorCode }),
    ...(failedAreas === undefined ? {} : { failedAreas }),
    ...(unreadAreas === undefined || outcome.endState !== 'CapReached' ? {} : { unreadAreas }),
  };
}

/** P8-111: a cancel before the run started, or a Stop on a run that this process does not run. */
export const cancelReasonOf = (run: Run): RunEndReason =>
  run.queueState === 'Queued' ? 'QueueCancel' : 'UserStop';

/**
 * P8-111: why a run the queue ran ended `Interrupted`: its owner stopped it (even if a shutdown
 * came after), or the server shut down under it. An `Interrupted` outcome that nobody caused has
 * no reason, and neither has any other end state.
 */
export function interruptReasonOf(
  outcome: RunOutcome,
  stop: { readonly byOwner: boolean; readonly byShutdown: boolean },
): RunEndReason | undefined {
  if (outcome.endState !== 'Interrupted') return undefined;
  if (stop.byOwner) return 'UserStop';
  return stop.byShutdown ? 'Restart' : undefined;
}

/**
 * RF-432, P9-03: what `run.ended` of a paused run that its owner stops says: `CapReached` with its
 * work kept and its unread areas, for its own reason and with no cap code, because no cap stopped it.
 */
export function pausedEnd(run: Run): EndDetail {
  return { endReason: 'StoppedAtApproval', unreadAreas: run.unreadAreas };
}

export function failureOf(error: unknown): RunOutcome {
  const errorCode = error instanceof RosettaError ? error.code : ERROR_CODES.unexpected;
  return { endState: 'Failed', errorCode };
}

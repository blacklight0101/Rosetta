import type { CardDraft } from '../../domain/cards/card-ids.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
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
}

/**
 * RF-1108, RF-208: stopped runs are `Interrupted`; a run whose every task failed is `Failed`; one
 * with areas that gave no card is `Completed` as before and says how many (`failedAreas`), so it is
 * never shown as a plain success. RF-423: a role that reached its cap stops without stopping the
 * run, so a run with a task stopped by a cap and no run-wide stop still ends `CapReached`: it did
 * not read everything it was asked to.
 */
// RF-1108, RF-208
export function sessionOutcome(end: SessionEnd): RunOutcome {
  if (end.aborted) return { endState: 'Interrupted' };
  if (end.outputFailure !== undefined) return { endState: 'Failed', errorCode: end.outputFailure };
  const { ends } = end;
  if (ends.some((each) => each.state === 'StoppedByCap')) {
    return { endState: 'CapReached', errorCode: ERROR_CODES.budgetCapReached };
  }
  const failed = ends.filter((each) => areaFailureOf(each) !== undefined);
  if (failed.length === 0) return { endState: 'Completed' };
  // RF-006: a resume that kept finished tasks did not fail as a whole.
  if (end.resumed || !ends.every((each) => each.state === 'Failed')) {
    return { endState: 'Completed', failedAreas: failed.length };
  }
  const code = ends.find((each) => each.code !== undefined)?.code;
  return code === undefined ? { endState: 'Failed' } : { endState: 'Failed', errorCode: code };
}

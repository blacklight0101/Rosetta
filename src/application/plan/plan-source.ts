import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunIndex } from '../ports/run-index.js';

// RF-614, RF-604, RST-1802, RF-1105, P3-121: the understand run a plan is written from. Plan setup
// names a run (`sourceRunId`, the run's id); without one the project's newest understand run that
// ended `Completed` is the source (RF-614, Q-D), and when it has none, its newest run that ended
// `CapReached`. A named run must be the user's, of this project (anything else is not found, like
// an unknown id), an understand run and must have ended `Completed` or `CapReached`: a run that
// stopped at a cap keeps the claims the verifier judged, so it can be planned from, and the
// package says so (RF-604). A run that failed or was interrupted is resumed first and `plan`
// refuses it; so does a run of either end state with no `Supported` claim (RST-1802).

type SourceProblem = typeof ERROR_CODES.notFound | typeof ERROR_CODES.planSourceMissing;

const isUnderstand = (run: Run): boolean => run.stage === 'understand';
const isCompleted = (run: Run): boolean => isUnderstand(run) && run.endState === 'Completed';

/** RF-604, P3-121: an understand run that ended `Completed` or at a cap can be planned from. */
const canBePlannedFrom = (run: Run): boolean =>
  isCompleted(run) || (isUnderstand(run) && run.endState === 'CapReached');

/** RF-614, P3-121: the newest completed understand run, else the newest one that ended at a cap. */
function newestPlannable(runs: readonly Run[]): Run | undefined {
  return runs.find(isCompleted) ?? runs.find(canBePlannedFrom);
}

/** RF-614: the source run, or the code of why there is none. */
export async function planSourceRun(
  runs: Pick<RunIndex, 'find' | 'list'>,
  owner: { readonly userId: string; readonly projectId: string },
  sourceRunId?: string,
): Promise<Result<Run, SourceProblem>> {
  if (sourceRunId === undefined) {
    const newest = newestPlannable(await runs.list(owner.userId, owner.projectId));
    return newest === undefined ? err(ERROR_CODES.planSourceMissing) : ok(newest);
  }
  const named = await runs.find(owner.userId, sourceRunId);
  if (named?.projectId !== owner.projectId) return err(ERROR_CODES.notFound);
  return canBePlannedFrom(named) ? ok(named) : err(ERROR_CODES.planSourceMissing);
}

import { ERROR_CODES } from '../../domain/errors/codes.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunIndex } from '../ports/run-index.js';

// RF-614, RF-604, RST-1802, RF-1105: the understand run a plan is written from. Plan setup names a run
// (`sourceRunId`, the run's id); without one the project's newest understand run that ended
// `Completed` is the source (RF-614, Q-D). A named run must be the user's, of this project (anything
// else is not found, like an unknown id), an understand run and must have ended `Completed`: a run
// that was capped, failed or interrupted is resumed first and `plan` refuses it (RST-1802).

type SourceProblem = typeof ERROR_CODES.notFound | typeof ERROR_CODES.planSourceMissing;

const isCompletedUnderstand = (run: Run): boolean =>
  run.stage === 'understand' && run.endState === 'Completed';

/** RF-614: the source run, or the code of why there is none. */
export async function planSourceRun(
  runs: Pick<RunIndex, 'find' | 'list'>,
  owner: { readonly userId: string; readonly projectId: string },
  sourceRunId?: string,
): Promise<Result<Run, SourceProblem>> {
  if (sourceRunId === undefined) {
    const listed = await runs.list(owner.userId, owner.projectId);
    const newest = listed.find(isCompletedUnderstand);
    return newest === undefined ? err(ERROR_CODES.planSourceMissing) : ok(newest);
  }
  const named = await runs.find(owner.userId, sourceRunId);
  if (named?.projectId !== owner.projectId) return err(ERROR_CODES.notFound);
  return isCompletedUnderstand(named) ? ok(named) : err(ERROR_CODES.planSourceMissing);
}

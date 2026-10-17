import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { TaskResults } from '../ports/task-results.js';
import { scopeOf } from '../runs/run-scope.js';
import { resumeSourceProblem } from './resume-state.js';

// RF-006: what would make a resumed run fail the same way every time, found before the run is
// reopened. A run reopened and then ended `Failed` can be resumed again, so these are refused first.

export interface ResumeProblemDependencies {
  readonly runs: Pick<RunIndex, 'list'>;
  readonly scans: ScanResults;
  readonly taskResults: TaskResults;
}

/** RST-1308: the code map is not the one the run read. RST-1309: its task results cannot be read. */
export type ResumeBlock =
  typeof ERROR_CODES.resumeSourceChanged | typeof ERROR_CODES.taskResultsUnreadable;

export type ResumeProblemCheck = (
  run: Run,
  manifest: RunManifest,
) => Promise<ResumeBlock | undefined>;

export function resumeProblemCheck(deps: ResumeProblemDependencies): ResumeProblemCheck {
  return async (run, manifest) => {
    const runs = await deps.runs.list(run.userId, run.projectId);
    const scan = runs.find((each) => each.stage === 'scan' && each.endState === 'Completed');
    if (scan !== undefined) {
      const scanned = await deps.scans.open(scan);
      if (resumeSourceProblem(manifest, scanned) !== undefined) {
        return ERROR_CODES.resumeSourceChanged;
      }
    }
    try {
      await deps.taskResults.read(scopeOf(run));
    } catch (error) {
      if (error instanceof RosettaError && error.code === ERROR_CODES.taskResultsUnreadable) {
        return error.code;
      }
      throw error;
    }
    return undefined;
  };
}

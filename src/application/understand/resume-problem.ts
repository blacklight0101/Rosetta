/* eslint-disable @typescript-eslint/no-unused-vars -- a stub until the check is written */
import type { ErrorCode } from '../../domain/errors/codes.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { Run } from '../../domain/runs/run.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { TaskResults } from '../ports/task-results.js';

// RF-006: what would make a resumed run fail the same way every time, found before the run is reopened.

export interface ResumeProblemDependencies {
  readonly runs: Pick<RunIndex, 'list'>;
  readonly scans: ScanResults;
  readonly taskResults: TaskResults;
}

export type ResumeProblemCheck = (
  run: Run,
  manifest: RunManifest,
) => Promise<ErrorCode | undefined>;

export function resumeProblemCheck(deps: ResumeProblemDependencies): ResumeProblemCheck {
  return () => Promise.resolve(undefined);
}

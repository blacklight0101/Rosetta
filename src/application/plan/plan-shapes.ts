import type { Run } from '../../domain/runs/run.js';
import type { Logger } from '../ports/logger.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults } from '../ports/scan-results.js';
import type { PlanInputs } from './plan-inputs.js';

// RF-155, P5-42: the newest completed scan of the snapshot the cards were read at (another snapshot
// is another repository state, so it is not used). The workbook formulas are read from it;
// `fixtures.md` no longer measures it (it is built from the seed and test data claims).

export interface PlanShapeDependencies {
  readonly runs: Pick<RunIndex, 'list'>;
  readonly scans: ScanResults;
  readonly logger: Logger;
}

/** RF-155, RF-632: the newest completed scan of the snapshot the source run read, if any. */
export async function scanOfSourceRun(
  deps: Pick<PlanShapeDependencies, 'runs'>,
  inputs: Pick<PlanInputs, 'project' | 'sourceRun'>,
): Promise<Run | undefined> {
  const { project, sourceRun } = inputs;
  if (sourceRun.snapshotKey === null) return undefined;
  const listed = await deps.runs.list(project.userId, project.id);
  return listed.find(
    (each) =>
      each.stage === 'scan' &&
      each.endState === 'Completed' &&
      each.snapshotKey === sourceRun.snapshotKey,
  );
}

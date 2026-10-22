import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { ScanShapes } from '../../domain/planning/scan-shapes.js';
import type { Run } from '../../domain/runs/run.js';
import type { Logger } from '../ports/logger.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults } from '../ports/scan-results.js';
import { measureScan } from './measure-scan.js';
import type { PlanInputs } from './plan-inputs.js';

// RF-632, DEC-135: the shapes `fixtures.md` lists, measured from the newest completed scan of the
// snapshot the cards were read at (another snapshot is another repository state, so it is not
// used). A scan whose output is gone or fails its check is logged and leaves the shapes undefined:
// the package is still written, and `fixtures.md` says nothing was measured.

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

// RF-632
export async function planShapes(
  deps: PlanShapeDependencies,
  inputs: PlanInputs,
): Promise<ScanShapes | undefined> {
  const { project, sourceRun } = inputs;
  const scan = await scanOfSourceRun(deps, inputs);
  if (scan === undefined) return undefined;
  try {
    const { codeMap, reader } = await deps.scans.open(scan);
    return await measureScan(codeMap, reader);
  } catch (error) {
    await deps.logger.log({
      ...{ level: 'warn', logger: 'plan', runId: sourceRun.runKey, userId: project.userId },
      code: error instanceof RosettaError ? error.code : ERROR_CODES.codeMapMissing,
      message: 'The scan could not be read, so fixtures.md lists no measured shape.',
    });
    return undefined;
  }
}

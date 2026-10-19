import type { Run } from '../../domain/runs/run.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScanResults, ScannedSource } from '../ports/scan-results.js';

// RF-209, RF-231: the scan a Deepen and the measures of a run read: the project's newest completed
// scan, the one whose code map a Deepen is seeded from.

// RF-209
export async function latestScan(
  deps: { readonly runs: Pick<RunIndex, 'list'>; readonly scans: ScanResults },
  run: Pick<Run, 'userId' | 'projectId'>,
): Promise<ScannedSource | undefined> {
  const runs = await deps.runs.list(run.userId, run.projectId);
  const scan = runs.find((each) => each.stage === 'scan' && each.endState === 'Completed');
  return scan === undefined ? undefined : deps.scans.open(scan);
}

import type { ErrorCode } from '../../domain/errors/codes.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { RunManifest } from '../../domain/runs/run-manifest.js';
import type { RunExecution } from '../ports/run-executor.js';
import type { ScannedSource } from '../ports/scan-results.js';
import type { TaskResults } from '../ports/task-results.js';
import { scopeOf } from '../runs/run-scope.js';
import { planResume, type ResumePlan } from './resume-plan.js';
import type { ReaderTask } from './reader-tasks.js';

// RF-006: what an understand run that is a resume reads before its tasks start. A run is a resume
// when its manifest already lists tasks: they were planned by an earlier session of the same run.

/** Whether the run was resumed: its manifest lists tasks an earlier session planned. */
function isResume(manifest: RunManifest): boolean {
  return manifest.agentTasks.length > 0;
}

/**
 * RF-006: the cards and ids of the finished tasks are those of the code map the run read, so a
 * resume on a different code map (a newer scan) would mix two sources; it is refused.
 */
export function resumeSourceProblem(
  manifest: RunManifest,
  scanned: Pick<ScannedSource, 'codeMapHash'>,
): ErrorCode | undefined {
  if (!isResume(manifest) || manifest.codemapHash === null) return undefined;
  return manifest.codemapHash === scanned.codeMapHash ? undefined : ERROR_CODES.resumeSourceChanged;
}

/** The tasks to run and the results to keep; every task, and nothing kept, for a run that is new. */
// RF-006
export async function planRunTasks(
  results: TaskResults,
  execution: Pick<RunExecution, 'run' | 'manifest'>,
  planned: readonly ReaderTask[],
): Promise<ResumePlan> {
  const { manifest, run } = execution;
  if (!isResume(manifest)) return { tasks: planned, kept: [] };
  return planResume(planned, manifest.agentTasks, await results.read(scopeOf(run)));
}

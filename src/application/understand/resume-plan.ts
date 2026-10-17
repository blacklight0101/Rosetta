import { isUnfinishedTask } from '../../domain/runs/run-states.js';
import type { ManifestAgentTask } from '../../domain/runs/run-manifest.js';
import type { TaskResult } from '../ports/task-results.js';
import type { ReaderTask } from './reader-tasks.js';

// RF-006: which tasks of an understand run a resume runs and which results it keeps.

export interface ResumePlan {
  /** The tasks to run, in area order. */
  readonly tasks: readonly ReaderTask[];
  /** The results of the tasks that finished, in area order. */
  readonly kept: readonly TaskResult[];
}

/**
 * A task is kept when the manifest lists it as finished and its result is stored for the same
 * area; any other task runs, so a result that is missing is never trusted (RF-006).
 */
// RF-006
export function planResume(
  planned: readonly ReaderTask[],
  listed: readonly ManifestAgentTask[],
  results: readonly TaskResult[],
): ResumePlan {
  const tasks: ReaderTask[] = [];
  const kept: TaskResult[] = [];
  for (const task of planned) {
    const entry = listed.find((each) => each.agentTaskId === task.agentTaskId);
    const result = results.find(
      (each) => each.agentTaskId === task.agentTaskId && each.area === task.area.name,
    );
    if (entry === undefined || isUnfinishedTask(entry.state) || result === undefined) {
      tasks.push(task);
    } else kept.push(result);
  }
  return { tasks, kept };
}

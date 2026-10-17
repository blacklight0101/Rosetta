/* eslint-disable @typescript-eslint/no-unused-vars -- stub until the feat commit */
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

// RF-006
export function planResume(
  planned: readonly ReaderTask[],
  listed: readonly ManifestAgentTask[],
  results: readonly TaskResult[],
): ResumePlan {
  return { tasks: planned, kept: [] };
}

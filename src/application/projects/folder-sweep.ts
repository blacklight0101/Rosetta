import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScheduledJob } from '../ports/scheduler.js';
import type { WorkspaceFolders } from '../ports/workspace-folders.js';

// P1-152, RF-1012, DEC-55, data-model.md section 9: the sweep of folders that no row owns.

/** A folder changed less than this long ago may belong to a row about to be written. */
export const ORPHAN_FOLDER_MIN_AGE_MS = 3_600_000;

export interface FolderSweepDeps {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly folders: WorkspaceFolders;
  readonly clock: Clock;
  readonly logger: Logger;
}

/** The scheduled job; it never rejects. */
export function folderSweepJob(deps: FolderSweepDeps): ScheduledJob {
  return async () => {
    await deps.folders.list();
  };
}

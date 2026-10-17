import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScheduledJob } from '../ports/scheduler.js';
import type { FolderTarget, ListedFolder, WorkspaceFolders } from '../ports/workspace-folders.js';
import { removeFolder } from '../use-cases/remove-folder.js';

// P1-152, RF-1012, DEC-55, data-model.md section 9: since P1-138 the rows of a project go before
// its folder, so a folder that could not be removed, or a crash after the commit, leaves a folder
// no row owns. The sweep removes those project and run folders, at start-up and daily. It removes a
// folder only when the row lookup, made just before the removal, finds nothing; it leaves alone a
// folder changed less than `ORPHAN_FOLDER_MIN_AGE_MS` ago (a folder written just before its row);
// and it stops at the first row it cannot read, so an unreachable database removes nothing.

/** A folder changed less than this long ago may belong to a row about to be written. */
export const ORPHAN_FOLDER_MIN_AGE_MS = 3_600_000;

export interface FolderSweepDeps {
  readonly projects: ProjectRepository;
  readonly runs: RunIndex;
  readonly folders: WorkspaceFolders;
  readonly clock: Clock;
  readonly logger: Logger;
}

interface ProjectGroup {
  /** The project folder when it is old enough to be swept. */
  project?: FolderTarget;
  /** The run folders old enough to be swept. */
  runs: FolderTarget[];
}

function folderName(target: FolderTarget): string {
  const project = `projects/${target.projectId}`;
  return target.runKey === undefined ? project : `${project}/runs/${target.runKey}`;
}

async function removeOrphan(deps: FolderSweepDeps, target: FolderTarget): Promise<void> {
  try {
    await removeFolder(deps.folders, deps.logger, target, 'gone');
  } catch {
    // removeFolder logged the failure with RST-1115; the next sweep tries again.
    return;
  }
  await deps.logger.log({
    level: 'info',
    logger: 'folder-sweep',
    message: `Removed the folder ${folderName(target)}: no row owns it.`,
    userId: target.userId,
    data: { folder: folderName(target), projectId: target.projectId },
  });
}

async function sweepRuns(
  deps: FolderSweepDeps,
  runFolders: readonly FolderTarget[],
): Promise<void> {
  for (const target of runFolders) {
    const rows = await deps.runs.list(target.userId, target.projectId);
    if (!rows.some((row) => row.runKey === target.runKey)) await removeOrphan(deps, target);
  }
}

async function sweepProject(deps: FolderSweepDeps, group: ProjectGroup): Promise<void> {
  const { project, runs } = group;
  // A young project folder keeps all its run folders for the next sweep.
  if (project === undefined) return;
  if ((await deps.projects.find(project.userId, project.projectId)) === undefined) {
    await removeOrphan(deps, project);
  } else {
    await sweepRuns(deps, runs);
  }
}

function groupByProject(listed: readonly ListedFolder[], cutOff: number): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  for (const { target, modifiedAt } of listed) {
    const key = `${target.userId}/${target.projectId}`;
    const group = groups.get(key) ?? { runs: [] };
    groups.set(key, group);
    const old = modifiedAt <= cutOff;
    if (target.runKey === undefined) {
      if (old) group.project = target;
    } else if (old) {
      group.runs.push(target);
    }
  }
  return [...groups.values()];
}

async function sweep(deps: FolderSweepDeps): Promise<void> {
  const cutOff = deps.clock.now().getTime() - ORPHAN_FOLDER_MIN_AGE_MS;
  for (const group of groupByProject(await deps.folders.list(), cutOff)) {
    await sweepProject(deps, group);
  }
}

/** The scheduled job; it never rejects, so a failing sweep cannot stop the server. */
export function folderSweepJob(deps: FolderSweepDeps): ScheduledJob {
  return async () => {
    try {
      await sweep(deps);
    } catch (error) {
      await deps.logger
        .log({
          level: 'error',
          logger: 'folder-sweep',
          message:
            'The sweep of folders without rows stopped and removed nothing more; it runs again at the next interval.',
          code: error instanceof RosettaError ? error.code : ERROR_CODES.databaseQueryFailed,
        })
        .catch(() => undefined);
    }
  };
}

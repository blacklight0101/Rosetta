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
// it stops at the first row it cannot read, so an unreachable database removes nothing; and it
// removes nothing when most folders look orphaned, which a database that is readable but empty or
// wrong (a new one, another connection string, an older backup) would cause.

/** A folder changed less than this long ago may belong to a row about to be written. */
export const ORPHAN_FOLDER_MIN_AGE_MS = 3_600_000;

/**
 * Up to this many orphan folders of one kind are always swept; above it, the sweep refuses when
 * they are more than half of the folders looked at (a new, restored or wrong database).
 */
const MAX_ORPHANS_ALWAYS_SWEPT = 2;

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

/** True when the row of the folder is still missing; asked again just before the removal. */
async function isOrphan(deps: FolderSweepDeps, target: FolderTarget): Promise<boolean> {
  if (target.runKey === undefined) {
    return (await deps.projects.find(target.userId, target.projectId)) === undefined;
  }
  const rows = await deps.runs.list(target.userId, target.projectId);
  return !rows.some((row) => row.runKey === target.runKey);
}

interface Plan {
  projects: FolderTarget[];
  runs: FolderTarget[];
  /** The project folders and the run folders (of projects with a row) that were looked at. */
  projectCount: number;
  runCount: number;
}

async function plan(deps: FolderSweepDeps, groups: readonly ProjectGroup[]): Promise<Plan> {
  const result: Plan = { projects: [], runs: [], projectCount: 0, runCount: 0 };
  for (const { project, runs } of groups) {
    // A young project folder keeps all its run folders for the next sweep.
    if (project === undefined) continue;
    result.projectCount += 1;
    if (await isOrphan(deps, project)) {
      result.projects.push(project);
      continue;
    }
    result.runCount += runs.length;
    for (const run of runs) if (await isOrphan(deps, run)) result.runs.push(run);
  }
  return result;
}

/** More than half of what was looked at, once it is more than a few folders. */
function tooMany(orphans: number, looked: number): boolean {
  return orphans > MAX_ORPHANS_ALWAYS_SWEPT && orphans * 2 > looked;
}

async function refuse(deps: FolderSweepDeps, found: Plan): Promise<void> {
  await deps.logger.log({
    level: 'error',
    logger: 'folder-sweep',
    message:
      'The sweep would remove most folders, which means the database may be empty or the wrong one; nothing was removed.',
    code: ERROR_CODES.folderRemovalFailed,
    data: {
      projectFolders: found.projectCount,
      orphanProjectFolders: found.projects.length,
      runFolders: found.runCount,
      orphanRunFolders: found.runs.length,
    },
  });
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
  const found = await plan(deps, groupByProject(await deps.folders.list(), cutOff));
  if (
    tooMany(found.projects.length, found.projectCount) ||
    tooMany(found.runs.length, found.runCount)
  ) {
    await refuse(deps, found);
    return;
  }
  for (const target of [...found.projects, ...found.runs]) {
    // The row is looked up again: it may have been written since the plan was made.
    if (await isOrphan(deps, target)) await removeOrphan(deps, target);
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

import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Clock } from '../ports/clock.js';
import type { Logger } from '../ports/logger.js';
import type { ProjectRepository } from '../ports/project-repository.js';
import type { RunIndex } from '../ports/run-index.js';
import type { ScheduledJob } from '../ports/scheduler.js';
import type { FolderTarget, ListedFolder, WorkspaceFolders } from '../ports/workspace-folders.js';
import { removeFolder } from '../use-cases/remove-folder.js';

// P1-152, P2-41, RF-1012, DEC-55, data-model.md section 9: a delete flow marks a folder before it
// removes the rows, so a folder that could not be removed, or a crash after the commit, leaves a
// marked folder no row owns. The sweep removes only those, at start-up and daily:
// - an unmarked folder with no row is logged and kept, however many there are: a new, empty, wrong
//   or restored database looks exactly like that, and must never cost a project its files;
// - a marked folder whose row is still there is a deletion that did not finish, and its mark is
//   cleared;
// - the run folders of a removed project go with it; a marked run folder is removed on its own;
// - nothing is removed when no project folder has a row while unmarked project folders exist (an
//   empty or wrong database);
// - the row lookup is made again just before each removal, a folder changed less than
//   `ORPHAN_FOLDER_MIN_AGE_MS` ago is left alone (its deletion may be running), and the sweep stops
//   at the first row it cannot read, so an unreachable database removes nothing.

/** A folder changed less than this long ago may belong to a deletion running now. */
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
  project?: ListedFolder;
  /** The run folders old enough to be swept. */
  runs: ListedFolder[];
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
    message: `Removed the folder ${folderName(target)}: a deletion marked it and no row owns it.`,
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
  /** Marked folders with no row. */
  remove: FolderTarget[];
  /** Marked folders whose row is there: a deletion that did not finish. */
  unmark: FolderTarget[];
  /** Unmarked folders with no row. */
  kept: FolderTarget[];
  /** The project folders with a row, and the unmarked ones, that were looked at. */
  withRows: number;
  unmarkedProjects: number;
}

/** Sorts one folder: marked or not, with a row or not. True when the folder has no row. */
async function classify(deps: FolderSweepDeps, folder: ListedFolder, into: Plan): Promise<boolean> {
  const orphan = await isOrphan(deps, folder.target);
  if (folder.marked) (orphan ? into.remove : into.unmark).push(folder.target);
  else if (orphan) into.kept.push(folder.target);
  return orphan;
}

async function plan(deps: FolderSweepDeps, groups: readonly ProjectGroup[]): Promise<Plan> {
  const result: Plan = { remove: [], unmark: [], kept: [], withRows: 0, unmarkedProjects: 0 };
  for (const { project, runs } of groups) {
    // A young project folder keeps all its run folders for the next sweep.
    if (project === undefined) continue;
    if (!project.marked) result.unmarkedProjects += 1;
    // The runs of a project without a row are not looked at: they go with a marked project and
    // stay with an unmarked one.
    if (await classify(deps, project, result)) continue;
    result.withRows += 1;
    for (const run of runs) await classify(deps, run, result);
  }
  return result;
}

async function refuse(deps: FolderSweepDeps, found: Plan): Promise<void> {
  await deps.logger.log({
    level: 'error',
    logger: 'folder-sweep',
    message:
      'No project folder has a row, which means the database may be empty or the wrong one; nothing was removed.',
    code: ERROR_CODES.folderRemovalFailed,
    data: { unmarkedProjectFolders: found.unmarkedProjects, markedFolders: found.remove.length },
  });
}

async function logKept(deps: FolderSweepDeps, target: FolderTarget): Promise<void> {
  await deps.logger.log({
    level: 'warn',
    logger: 'folder-sweep',
    message: `Kept the folder ${folderName(target)}: no row owns it, but no deletion marked it.`,
    userId: target.userId,
    data: { folder: folderName(target), projectId: target.projectId },
  });
}

function groupByProject(listed: readonly ListedFolder[], cutOff: number): ProjectGroup[] {
  const groups = new Map<string, ProjectGroup>();
  for (const folder of listed) {
    const { target } = folder;
    const key = `${target.userId}/${target.projectId}`;
    const group = groups.get(key) ?? { runs: [] };
    groups.set(key, group);
    if (folder.modifiedAt > cutOff) continue;
    if (target.runKey === undefined) group.project = folder;
    else group.runs.push(folder);
  }
  return [...groups.values()];
}

async function sweep(deps: FolderSweepDeps): Promise<void> {
  const cutOff = deps.clock.now().getTime() - ORPHAN_FOLDER_MIN_AGE_MS;
  const found = await plan(deps, groupByProject(await deps.folders.list(), cutOff));
  if (found.withRows === 0 && found.unmarkedProjects > 0) {
    await refuse(deps, found);
    return;
  }
  for (const target of found.kept) await logKept(deps, target);
  for (const target of found.remove) {
    // The row is looked up again: it may have been written since the plan was made.
    if (await isOrphan(deps, target)) await removeOrphan(deps, target);
  }
  for (const target of found.unmark) {
    if (!(await isOrphan(deps, target))) await deps.folders.unmark(target);
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

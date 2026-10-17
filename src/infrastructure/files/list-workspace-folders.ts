import { lstat, readdir, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { ListedFolder } from '../../application/ports/workspace-folders.js';
import { isRealFolder } from './run-folder.js';
import { isProjectId, isRunKey, isUserId } from './workspace-paths.js';

// P1-152, RF-005, data-model.md section 2: the project and run folders of the data folder, for the
// sweep of folders without rows. Only real folders are listed, whose names are ids: a link (a
// junction or symbolic link) is neither listed nor followed, a file is skipped and so is any other
// name. A folder that vanishes while it is read is skipped.

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** The names in `parent` that are real folders and that `accepts`, in name order. */
async function realFolders(parent: string, accepts: (name: string) => boolean): Promise<string[]> {
  if (!(await isRealFolder(parent))) return [];
  const names = (await readdir(parent)).filter(accepts).sort();
  const real = await Promise.all(names.map((name) => isRealFolder(join(parent, name))));
  return names.filter((_, index) => real[index] === true);
}

async function changedAt(folder: string): Promise<number | undefined> {
  try {
    return (await lstat(folder)).mtimeMs;
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
}

async function listProject(
  folder: string,
  target: { readonly userId: string; readonly projectId: string },
): Promise<ListedFolder[]> {
  const own = await changedAt(folder);
  if (own === undefined) return [];
  const listed: ListedFolder[] = [{ target, modifiedAt: own }];
  const runs = join(folder, 'runs');
  for (const runKey of await realFolders(runs, isRunKey)) {
    const modifiedAt = await changedAt(join(runs, runKey));
    if (modifiedAt !== undefined) listed.push({ target: { ...target, runKey }, modifiedAt });
  }
  return listed;
}

/** Every project folder, each followed by its run folders; none when the data folder is missing. */
export async function listWorkspaceFolders(dataDir: string): Promise<ListedFolder[]> {
  const realData = await realpath(dataDir).catch(() => undefined);
  if (realData === undefined) return [];
  const listed: ListedFolder[] = [];
  const users = join(realData, 'users');
  for (const userId of await realFolders(users, isUserId)) {
    const projects = join(users, userId, 'projects');
    for (const projectId of await realFolders(projects, isProjectId)) {
      listed.push(...(await listProject(join(projects, projectId), { userId, projectId })));
    }
  }
  return listed;
}

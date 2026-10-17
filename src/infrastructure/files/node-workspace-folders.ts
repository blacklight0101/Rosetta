import { lstat, readdir, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import type {
  FolderTarget,
  ListedFolder,
  WorkspaceFolders,
} from '../../application/ports/workspace-folders.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { listWorkspaceFolders } from './list-workspace-folders.js';
import { isRealFolder } from './run-folder.js';
import { projectPath, runPath, workspaceRoot } from './workspace-paths.js';

// RF-1012, RF-005, RF-1105, data-model.md section 2: the size and the removal of a project or run
// folder of a user's workspace. The folder is built from ids and checked to be the real folder:
// a link on the way to it (a `runs` folder swapped for a junction) makes it "not there", so nothing
// outside the workspace is measured or removed. Inside the folder a link is neither followed when
// measuring nor when removing (`rm` removes the link itself).

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** The bytes of the plain files under the folder; links and anything that vanishes count 0. */
async function sizeOf(folder: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (isMissing(error)) return 0;
    throw error;
  }
  let total = 0;
  for (const entry of entries) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) total += await sizeOf(path);
    else if (entry.isFile()) total += (await lstat(path).catch(() => undefined))?.size ?? 0;
  }
  return total;
}

export class NodeWorkspaceFolders implements WorkspaceFolders {
  readonly #dataDir: string;

  constructor(dataDir: string) {
    this.#dataDir = dataDir;
  }

  // P1-152
  list(): Promise<readonly ListedFolder[]> {
    return listWorkspaceFolders(this.#dataDir);
  }

  // P2-41
  async mark(target: FolderTarget): Promise<void> {
    await Promise.resolve(target);
  }

  // P2-41
  async unmark(target: FolderTarget): Promise<void> {
    await Promise.resolve(target);
  }

  // RF-1012
  async size(target: FolderTarget): Promise<number> {
    const folder = await this.#locate(target);
    return folder === undefined ? 0 : sizeOf(folder);
  }

  // RF-1012, RF-005
  async remove(target: FolderTarget): Promise<void> {
    const folder = await this.#locate(target);
    if (folder !== undefined) await rm(folder, { recursive: true, force: true });
  }

  /** The folder of the target, or undefined when it is not there or is not a real folder. */
  async #locate(target: FolderTarget): Promise<string | undefined> {
    const realData = await realpath(this.#dataDir).catch(() => undefined);
    if (realData === undefined) return undefined;
    try {
      const inside =
        target.runKey === undefined
          ? projectPath(target.projectId)
          : runPath(target.projectId, target.runKey);
      const folder = join(workspaceRoot(realData, target.userId), ...inside.split('/'));
      return (await isRealFolder(folder)) ? folder : undefined;
    } catch (error) {
      // An id that is not an id has no folder; any other failure is not ours to hide.
      if (error instanceof RosettaError) return undefined;
      throw error;
    }
  }
}

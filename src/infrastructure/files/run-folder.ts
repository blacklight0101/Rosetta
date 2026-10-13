import { lstat, realpath } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunScope } from '../../application/ports/run-events.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { runPath, workspaceRoot } from './workspace-paths.js';

// RF-008, RF-506, RF-1105, RF-005: finding a run folder in the data folder and checking that what is
// found is the real thing. The run folder, and every folder on the way to it, must be a real
// folder: a link anywhere on the path refuses it. The path is built from ids, never from request
// text.

/**
 * The run folder of the scope below the data folder's real path, or undefined when the user, the
 * project or the run key is not an id (no folder can have such a name). Any failure that is not an
 * invalid id is not hidden.
 */
export function runFolderOf(realData: string, scope: RunScope): string | undefined {
  try {
    return join(
      workspaceRoot(realData, scope.userId),
      ...runPath(scope.projectId, scope.runKey).split('/'),
    );
  } catch (error) {
    if (error instanceof RosettaError) return undefined;
    throw error;
  }
}

/** True when `folder` is a real folder: it exists, is not a link and no folder above it is one. */
export async function isRealFolder(folder: string): Promise<boolean> {
  const info = await lstat(folder).catch(() => undefined);
  if (!info?.isDirectory()) return false;
  return (await realpath(folder)) === folder;
}

/** Whether the file may be read or archived: a plain file nobody else holds a second name for. */
export async function isOwnFile(path: string): Promise<boolean> {
  const info = await lstat(path);
  return info.isFile() && info.nlink === 1;
}

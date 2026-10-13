import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Logger } from '../ports/logger.js';
import type { FolderTarget, WorkspaceFolders } from '../ports/workspace-folders.js';

// RF-1012, DEC-55, data-model.md section 9, P1-121: a deletion removes the folder before the rows,
// so a folder that cannot be removed (held open, no permission) never becomes an orphan that
// nothing points to: the rows stay, the run or project is still listed and can be deleted again.
// The failure is logged as an `error` with RST-1115 naming the folder, and thrown with that code.

/** `projects/<projectId>` or `projects/<projectId>/runs/<runKey>`, as the history page names it. */
function folderOf(target: FolderTarget): string {
  const project = `projects/${target.projectId}`;
  return target.runKey === undefined ? project : `${project}/runs/${target.runKey}`;
}

// RF-1012
export async function removeFolder(
  folders: WorkspaceFolders,
  logger: Logger,
  target: FolderTarget,
): Promise<void> {
  try {
    await folders.remove(target);
  } catch (error) {
    const folder = folderOf(target);
    await logger.log({
      level: 'error',
      logger: 'history',
      message: `The folder ${folder} could not be removed; nothing was deleted.`,
      code: ERROR_CODES.folderRemovalFailed,
      userId: target.userId,
      data: { folder, reason: error instanceof Error ? error.message : String(error) },
    });
    throw new RosettaError(ERROR_CODES.folderRemovalFailed, undefined, { cause: error });
  }
}

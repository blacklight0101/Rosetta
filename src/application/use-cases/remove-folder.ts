import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { Logger } from '../ports/logger.js';
import type { FolderTarget, WorkspaceFolders } from '../ports/workspace-folders.js';

// RF-1012, DEC-55, data-model.md section 9, P1-121, P1-138: Delete run removes the folder before
// the row, so a folder that cannot be removed (held open, no permission) leaves the run listed and
// it can be deleted again; Delete project removes it after the rows are committed (`rows` is
// `gone`), so the folder stays. The failure is logged as an `error` with RST-1115 naming the
// folder, and thrown with that code. P2-41: both flows mark the folder first (`markFolder`), so the
// sweep of folders without rows removes only what a deletion marked; a folder that cannot be marked
// stops the deletion before any row goes, with the same code.

/** `projects/<projectId>` or `projects/<projectId>/runs/<runKey>`, as the history page names it. */
function folderOf(target: FolderTarget): string {
  const project = `projects/${target.projectId}`;
  return target.runKey === undefined ? project : `${project}/runs/${target.runKey}`;
}

// P2-41
export async function markFolder(
  folders: WorkspaceFolders,
  logger: Logger,
  target: FolderTarget,
): Promise<void> {
  try {
    await folders.mark(target);
  } catch (error) {
    const folder = folderOf(target);
    await logger.log({
      level: 'error',
      logger: 'history',
      message: `The folder ${folder} could not be marked for deletion; nothing was deleted.`,
      code: ERROR_CODES.folderRemovalFailed,
      userId: target.userId,
      data: { folder, reason: error instanceof Error ? error.message : String(error) },
    });
    throw new RosettaError(ERROR_CODES.folderRemovalFailed, undefined, { cause: error });
  }
}

// RF-1012
export async function removeFolder(
  folders: WorkspaceFolders,
  logger: Logger,
  target: FolderTarget,
  rows: 'kept' | 'gone' = 'kept',
): Promise<void> {
  try {
    await folders.remove(target);
  } catch (error) {
    const folder = folderOf(target);
    await logger.log({
      level: 'error',
      logger: 'history',
      message: `The folder ${folder} could not be removed; ${rows === 'kept' ? 'nothing was deleted' : 'its rows are already deleted, so remove the folder by hand'}.`,
      code: ERROR_CODES.folderRemovalFailed,
      userId: target.userId,
      data: { folder, reason: error instanceof Error ? error.message : String(error) },
    });
    throw new RosettaError(ERROR_CODES.folderRemovalFailed, undefined, { cause: error });
  }
}

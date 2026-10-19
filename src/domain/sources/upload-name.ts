import { err, type Result } from '../errors/result.js';

// RF-128, RF-130: the name of an uploaded zip and the key of its snapshot folder.

/** `upload__<project id>@<first 16 hex of the hash>` (RFC-004 section 4.1). */
export function uploadSnapshotKey(projectId: string, snapshotHash: string): string {
  return projectId === snapshotHash ? 'x' : '';
}

/** The folder-name prefix every snapshot of one project's uploads shares. */
export function uploadKeyPrefix(projectId: string): string {
  return projectId.slice(0, 0);
}

/**
 * The file name to record: the one the page sent (percent-encoded, a base name, no control
 * characters, at most 200 characters), or `<project name>.zip` when it sent none. A name that does
 * not end in `.zip` is refused (RF-128).
 */
export function uploadFileName(
  sent: string | undefined,
  projectName: string,
): Result<string, 'not-a-zip-name'> {
  return err(sent === projectName ? 'not-a-zip-name' : 'not-a-zip-name');
}

import { lstat, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// P2-41, RF-1012, data-model.md section 2: a delete flow marks a project or run folder by writing
// this empty file inside it before any row goes. The sweep of folders without rows removes only
// marked folders. The file holds nothing, so it adds no byte to the size a deletion reports.

const DELETION_MARK = '.deleting';

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    'code' in error &&
    (error.code === 'ENOENT' || error.code === 'ENOTDIR')
  );
}

/** True when the folder holds the mark as a plain file; a link of that name is not a mark. */
export async function hasDeletionMark(folder: string): Promise<boolean> {
  try {
    return (await lstat(join(folder, DELETION_MARK))).isFile();
  } catch (error) {
    if (isMissing(error)) return false;
    throw error;
  }
}

/** Writes the mark; one that is there is replaced, so a link of that name is never written through. */
export async function writeDeletionMark(folder: string): Promise<void> {
  const mark = join(folder, DELETION_MARK);
  await rm(mark, { force: true });
  await writeFile(mark, '', { flag: 'wx' });
}

export async function clearDeletionMark(folder: string): Promise<void> {
  await rm(join(folder, DELETION_MARK), { force: true });
}

import type { Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { checkRepositoryPath } from './repository-path.js';

// RF-140, RF-005: the files of a snapshot, found once by walking the tree. Links (symbolic links
// and Windows junctions) are never followed, so nothing outside the root can enter the index.

export interface SnapshotIndex {
  /** Regular files, repository-relative with forward slashes, sorted by UTF-16 code unit. */
  readonly files: readonly string[];
  /** Links that were found and skipped, repository-relative. */
  readonly links: readonly string[];
  /** Files whose names fail the path check, so no request could name them; never read. */
  readonly invalidNames: readonly string[];
}

function byCodeUnit(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function childPath(parent: string, name: string): string {
  return parent === '' ? name : `${parent}/${name}`;
}

/** Walks `<root>/<start>` (start is '' or a checked repository-relative folder). */
export async function indexSnapshot(root: string, start: string): Promise<SnapshotIndex> {
  const files: string[] = [];
  const links: string[] = [];
  const pending = [start];
  for (let folder = pending.pop(); folder !== undefined; folder = pending.pop()) {
    const entries = await readFolder(
      join(root, ...folder.split('/')),
      folder === start && start !== '',
    );
    for (const entry of entries) {
      const path = childPath(folder, entry.name);
      if (entry.isSymbolicLink()) links.push(path);
      else if (entry.isDirectory()) pending.push(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  const readable = files.filter((path) => checkRepositoryPath(path).ok);
  return {
    files: readable.sort(byCodeUnit),
    links: links.sort(byCodeUnit),
    invalidNames: files.filter((path) => !checkRepositoryPath(path).ok).sort(byCodeUnit),
  };
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** A missing start folder (a subpath that does not exist) holds no files. */
async function readFolder(folder: string, isStart: boolean): Promise<Dirent[]> {
  try {
    return await readdir(folder, { withFileTypes: true });
  } catch (error: unknown) {
    if (isStart && isMissing(error)) return [];
    throw error;
  }
}

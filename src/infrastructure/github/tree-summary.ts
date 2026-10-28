import { createHash } from 'node:crypto';

// RF-005, RF-152, DEC-183: what a snapshot tree comes to, built from the hash and size of each file.

export interface TreeSummary {
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly snapshotHash: string;
}

/** A file of a tree as it was written: relative forward-slash path, hex SHA-256 and size. */
export interface HashedFile {
  readonly path: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** Orders paths by code unit, as the tree hash has always done. */
const byPath = (a: HashedFile, b: HashedFile): number =>
  a.path < b.path ? -1 : a.path > b.path ? 1 : 0;

/**
 * The count, the bytes and the `sha256:` hash of the sorted lines of path, NUL, file hash and newline.
 * Whoever wrote the files hashed them, so this reads nothing (DEC-183); a walk of the written tree
 * gives the same summary.
 */
export function summarizeTree(files: readonly HashedFile[]): TreeSummary {
  const hash = createHash('sha256');
  let totalBytes = 0;
  for (const file of [...files].sort(byPath)) {
    totalBytes += file.bytes;
    hash.update(`${file.path}\0${file.sha256}\n`);
  }
  return {
    fileCount: files.length,
    totalBytes,
    snapshotHash: `sha256:${hash.digest('hex')}`,
  };
}

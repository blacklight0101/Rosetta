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

/** Placeholder until the summary is built from write-time hashes (P5-47). */
export function summarizeTree(files: readonly HashedFile[]): TreeSummary {
  return { fileCount: 0, totalBytes: 0, snapshotHash: `unset:${String(files.length)}` };
}

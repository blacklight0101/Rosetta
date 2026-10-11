import { byCodeUnit } from './code-unit-order.js';
import type { FileEntry } from './file-entry.js';

// RF-104: the automatic grouping by folder. Every top-level folder is its own bucket; a folder whose
// files together pass the token budget is split by sub-folder, its own files staying in a bucket
// named after the folder.

export interface FolderBucket {
  readonly name: string;
  readonly files: readonly FileEntry[];
}

/** The name of the bucket for files at the repository root. */
const rootBucketName = '(root)';

function directoryOf(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash < 0 ? '' : path.slice(0, slash);
}

/** The sub-folder of `folder` that holds `path`, which lies strictly below `folder`. */
function childFolder(folder: string, path: string): string {
  const below = path.slice(folder === '' ? 0 : folder.length + 1);
  const name = below.slice(0, below.indexOf('/'));
  return folder === '' ? name : `${folder}/${name}`;
}

function sumTokens(files: readonly FileEntry[]): number {
  return files.reduce((sum, file) => sum + file.estimatedTokens, 0);
}

function groupBy(
  files: readonly FileEntry[],
  keyOf: (file: FileEntry) => string,
): readonly (readonly [string, FileEntry[]])[] {
  const groups = new Map<string, FileEntry[]>();
  for (const file of files) {
    const key = keyOf(file);
    const group = groups.get(key);
    if (group === undefined) groups.set(key, [file]);
    else group.push(file);
  }
  return [...groups.entries()].sort(([a], [b]) => byCodeUnit(a, b));
}

function splitFolder(
  folder: string,
  files: readonly FileEntry[],
  budget: number,
  out: FolderBucket[],
): void {
  if (sumTokens(files) <= budget) {
    out.push({ name: folder, files });
    return;
  }
  const direct = files.filter((file) => directoryOf(file.path) === folder);
  if (direct.length > 0) out.push({ name: folder, files: direct });
  const below = files.filter((file) => directoryOf(file.path) !== folder);
  for (const [child, inside] of groupBy(below, (file) => childFolder(folder, file.path))) {
    splitFolder(child, inside, budget, out);
  }
}

/** Buckets for `files` (any order), sorted by name; no bucket is empty. */
export function folderBuckets(files: readonly FileEntry[], budget: number): FolderBucket[] {
  const buckets: FolderBucket[] = [];
  const atRoot = files.filter((file) => !file.path.includes('/'));
  if (atRoot.length > 0) buckets.push({ name: rootBucketName, files: atRoot });
  const nested = files.filter((file) => file.path.includes('/'));
  for (const [top, inside] of groupBy(nested, (file) => childFolder('', file.path))) {
    splitFolder(top, inside, budget, buckets);
  }
  return buckets.sort((a, b) => byCodeUnit(a.name, b.name));
}

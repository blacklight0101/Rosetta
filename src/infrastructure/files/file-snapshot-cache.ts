import { chmod, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { CachedSnapshot, SnapshotCache } from '../../application/ports/snapshot-cache.js';
import { isRealFolder } from './run-folder.js';
import { isUploadSnapshotKey } from '../../domain/sources/upload-name.js';
import { isWorkbookSnapshotKey } from '../../domain/sources/workbook-key.js';
import { snapshotCacheRoot } from './workspace-paths.js';

// RF-1012, RF-005, data-model.md section 3.3: the snapshots of `<data>/sources/`, listed from their
// `snapshot.json` and removed whole. Only a folder named `<owner>__<repo>@<sha>` is a snapshot: a
// partial download (`.partial-*`), a folder without a readable snapshot.json and anything else is
// neither listed nor removable, and a key that is not of that shape never reaches the file system.

const GITHUB_KEY = /^[a-z0-9._-]+__[a-z0-9._-]+@[0-9a-f]{40}$/u;

function isSnapshotKey(key: string): boolean {
  return GITHUB_KEY.test(key) || isUploadSnapshotKey(key) || isWorkbookSnapshotKey(key);
}
const INFO_FILE = 'snapshot.json';
const WRITABLE_FILE = 0o644;
const WRITABLE_DIR = 0o755;

const githubInfo = z.looseObject({
  owner: z.string(),
  repo: z.string(),
  commitSha: z.string(),
  downloadedAt: z.string(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
});

// RF-130: an upload record names its kind, the zip and the instant; it has no repository or commit.
const uploadInfo = z.looseObject({
  kind: z.literal('upload'),
  fileName: z.string(),
  uploadedAt: z.string(),
  snapshotHash: z.string(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
});

// RF-152: a workbook record names its kind, the instant and the renderer; it has no repository, commit or zip.
const workbookInfo = z.looseObject({
  kind: z.literal('workbook'),
  uploadedAt: z.string(),
  snapshotHash: z.string(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
});

/**
 * The two calls a removal makes. The server uses `node:fs/promises`; a test passes one that refuses
 * a read-only tree on every system (Windows ignores the mode of a folder), P1-121.
 */
export interface RemovalFileSystem {
  chmod(path: string, mode: number): Promise<void>;
  rm(path: string, options: { readonly recursive: true; readonly force: true }): Promise<void>;
}

const nodeRemoval: RemovalFileSystem = { chmod, rm };

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** The description of a complete snapshot folder; undefined when it has none or it is damaged. */
async function describeSnapshot(folder: string, key: string): Promise<CachedSnapshot | undefined> {
  let text: string;
  try {
    text = await readFile(join(folder, INFO_FILE), 'utf8');
  } catch (error) {
    if (isMissing(error)) return undefined;
    throw error;
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return undefined;
  }
  return describeRecord(json, key);
}

/** The listing of a record, read as the kind its folder name says; undefined when it is neither. */
function describeRecord(json: unknown, key: string): CachedSnapshot | undefined {
  if (isUploadSnapshotKey(key)) {
    const upload = uploadInfo.safeParse(json);
    if (!upload.success) return undefined;
    const { fileName, uploadedAt, snapshotHash, fileCount, totalBytes } = upload.data;
    return {
      key,
      repository: `${fileName} (upload)`,
      commitSha: snapshotHash,
      downloadedAt: uploadedAt,
      fileCount,
      totalBytes,
    };
  }
  if (isWorkbookSnapshotKey(key)) {
    const workbook = workbookInfo.safeParse(json);
    if (!workbook.success) return undefined;
    const { uploadedAt, snapshotHash, fileCount, totalBytes } = workbook.data;
    return {
      key,
      repository: 'Excel workbooks',
      commitSha: snapshotHash,
      downloadedAt: uploadedAt,
      fileCount,
      totalBytes,
    };
  }
  const parsed = githubInfo.safeParse(json);
  if (!parsed.success) return undefined;
  const { owner, repo, commitSha, downloadedAt, fileCount, totalBytes } = parsed.data;
  return { key, repository: `${owner}/${repo}`, commitSha, downloadedAt, fileCount, totalBytes };
}

function inListOrder(left: CachedSnapshot, right: CachedSnapshot): number {
  if (left.repository !== right.repository) return left.repository < right.repository ? -1 : 1;
  if (left.downloadedAt !== right.downloadedAt) {
    return left.downloadedAt < right.downloadedAt ? 1 : -1;
  }
  return left.key < right.key ? -1 : 1;
}

/** The fetcher leaves the tree read-only (RF-005); a folder must be writable to lose its entries. */
async function makeWritable(files: RemovalFileSystem, folder: string): Promise<void> {
  await files.chmod(folder, WRITABLE_DIR);
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await makeWritable(files, path);
    else if (entry.isFile()) await files.chmod(path, WRITABLE_FILE);
  }
}

export class FileSnapshotCache implements SnapshotCache {
  readonly #dataDir: string;
  readonly #files: RemovalFileSystem;

  constructor(dataDir: string, files: RemovalFileSystem = nodeRemoval) {
    this.#dataDir = dataDir;
    this.#files = files;
  }

  // RF-1012
  async list(): Promise<readonly CachedSnapshot[]> {
    const root = await this.#root();
    if (root === undefined) return [];
    let entries;
    try {
      entries = await readdir(root, { withFileTypes: true });
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const found: CachedSnapshot[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory() || !isSnapshotKey(entry.name)) continue;
      const snapshot = await describeSnapshot(join(root, entry.name), entry.name);
      if (snapshot !== undefined) found.push(snapshot);
    }
    return found.sort(inListOrder);
  }

  // RF-1012, RF-005
  async remove(key: string): Promise<boolean> {
    const root = await this.#root();
    if (root === undefined || !isSnapshotKey(key)) return false;
    const folder = join(root, key);
    if (!(await isRealFolder(folder))) return false;
    await makeWritable(this.#files, folder);
    await this.#files.rm(folder, { recursive: true, force: true });
    return true;
  }

  /** `<data>/sources` built from the real path of the data folder; undefined when there is none. */
  async #root(): Promise<string | undefined> {
    const realData = await realpath(this.#dataDir).catch(() => undefined);
    return realData === undefined ? undefined : snapshotCacheRoot(realData);
  }
}

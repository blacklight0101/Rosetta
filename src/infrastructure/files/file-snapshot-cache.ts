import { chmod, readdir, readFile, realpath, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { CachedSnapshot, SnapshotCache } from '../../application/ports/snapshot-cache.js';
import { isRealFolder } from './run-folder.js';
import { snapshotCacheRoot } from './workspace-paths.js';

// RF-1012, RF-005, data-model.md section 3.3: the snapshots of `<data>/sources/`, listed from their
// `snapshot.json` and removed whole. Only a folder named `<owner>__<repo>@<sha>` is a snapshot: a
// partial download (`.partial-*`), a folder without a readable snapshot.json and anything else is
// neither listed nor removable, and a key that is not of that shape never reaches the file system.

const KEY = /^[a-z0-9._-]+__[a-z0-9._-]+@[0-9a-f]{40}$/u;
const INFO_FILE = 'snapshot.json';
const WRITABLE_FILE = 0o644;
const WRITABLE_DIR = 0o755;

const info = z.looseObject({
  owner: z.string(),
  repo: z.string(),
  commitSha: z.string(),
  downloadedAt: z.string(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
});

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
  const parsed = info.safeParse(json);
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
async function makeWritable(folder: string): Promise<void> {
  await chmod(folder, WRITABLE_DIR);
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) await makeWritable(path);
    else if (entry.isFile()) await chmod(path, WRITABLE_FILE);
  }
}

export class FileSnapshotCache implements SnapshotCache {
  readonly #dataDir: string;

  constructor(dataDir: string) {
    this.#dataDir = dataDir;
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
      if (!entry.isDirectory() || !KEY.test(entry.name)) continue;
      const snapshot = await describeSnapshot(join(root, entry.name), entry.name);
      if (snapshot !== undefined) found.push(snapshot);
    }
    return found.sort(inListOrder);
  }

  // RF-1012, RF-005
  async remove(key: string): Promise<boolean> {
    const root = await this.#root();
    if (root === undefined || !KEY.test(key)) return false;
    const folder = join(root, key);
    if (!(await isRealFolder(folder))) return false;
    await makeWritable(folder);
    await rm(folder, { recursive: true, force: true });
    return true;
  }

  /** `<data>/sources` built from the real path of the data folder; undefined when there is none. */
  async #root(): Promise<string | undefined> {
    const realData = await realpath(this.#dataDir).catch(() => undefined);
    return realData === undefined ? undefined : snapshotCacheRoot(realData);
  }
}

import { createHash } from 'node:crypto';
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { join, sep } from 'node:path';
import { z } from 'zod';
import type { Snapshot, SnapshotInfo } from '../../application/ports/source-fetcher.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { errorCode, snapshotWriteFailed } from './snapshot-errors.js';

export interface TreeSummary {
  readonly fileCount: number;
  readonly totalBytes: number;
  readonly snapshotHash: string;
}

const PARTIAL_PREFIX = '.partial-';
const FILES = 'files';
const INFO_FILE = 'snapshot.json';
const READ_ONLY_FILE = 0o444;
const READ_ONLY_DIR = 0o555;

const INFO_SCHEMA = z.object({
  url: z.string(),
  owner: z.string(),
  repo: z.string(),
  commitSha: z.string().regex(/^[0-9a-f]{40}$/),
  resolvedFrom: z.string(),
  downloadedAt: z.string(),
  fileCount: z.number().int().nonnegative(),
  totalBytes: z.number().int().nonnegative(),
  skippedLinks: z.number().int().nonnegative(),
  snapshotHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  licence: z.string(),
});

const SNAPSHOT_SCHEMA = INFO_SCHEMA.extend({ schemaVersion: z.literal(1) });

function entryRefused(detail: string): RosettaError {
  return new RosettaError(ERROR_CODES.snapshotEntryRefused, `The extracted tree ${detail}.`);
}

/** Runs a file-system step; a Node failure becomes RST-1908 naming the step. */
async function onDisk<T>(what: string, action: () => Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof RosettaError) throw error;
    throw snapshotWriteFailed(what, error);
  }
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (errorCode(error) === 'ENOENT') return false;
    throw snapshotWriteFailed('folder could not be checked', error);
  }
}

const READ_CHUNK_BYTES = 64 * 1024;

async function hashFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  const handle = await open(path);
  try {
    const buffer = Buffer.alloc(READ_CHUNK_BYTES);
    for (;;) {
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
      if (bytesRead === 0) break;
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await handle.close();
  }
  return hash.digest('hex');
}

/** ADR-019: every entry's real path must lie inside the real snapshot tree. */
async function assertInside(realRoot: string, absolute: string, path: string): Promise<void> {
  const real = await realpath(absolute);
  if (real !== realRoot && !real.startsWith(realRoot + sep)) {
    throw entryRefused(
      `has an entry that resolves outside the snapshot folder: ${JSON.stringify(path)}`,
    );
  }
}

/**
 * Relative forward-slash paths of every regular file under `root`; an entry that resolves outside
 * the tree or is a link anywhere is refused (ADR-019).
 */
async function listFiles(root: string, realRoot: string, relative = ''): Promise<string[]> {
  const found: string[] = [];
  for (const entry of await readdir(join(root, relative), { withFileTypes: true })) {
    const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
    const absolute = join(root, path);
    await assertInside(realRoot, absolute, path);
    if (entry.isSymbolicLink() || (await lstat(absolute)).isSymbolicLink()) {
      throw entryRefused(`contains a link at ${JSON.stringify(path)}`);
    }
    if (entry.isDirectory()) found.push(...(await listFiles(root, realRoot, path)));
    else if (entry.isFile()) found.push(path);
  }
  return found;
}

async function markReadOnly(dir: string): Promise<void> {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await markReadOnly(path);
    else if (entry.isFile()) await chmod(path, READ_ONLY_FILE);
  }
  await chmod(dir, READ_ONLY_DIR);
}

/** `snapshot.json` text as data; text that is not JSON is a damaged snapshot (RST-1906). */
function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new RosettaError(
      ERROR_CODES.snapshotEntryRefused,
      `The cached snapshot has a ${INFO_FILE} that is not JSON.`,
      { cause: error },
    );
  }
}

/**
 * The snapshot cache under `<data>/sources/` (data-model.md section 3.3): partial folders, the
 * final rename, `snapshot.json`, the content hash and the read-only marking.
 */
// RF-005, RF-122, RF-126
export class SnapshotStore {
  readonly sourcesDir: string;

  constructor(dataDir: string) {
    this.sourcesDir = join(dataDir, 'sources');
  }

  partialDir(id: string): string {
    return join(this.sourcesDir, `${PARTIAL_PREFIX}${id}`);
  }

  snapshotDir(key: string): string {
    return join(this.sourcesDir, key);
  }

  filesDir(key: string): string {
    return join(this.snapshotDir(key), FILES);
  }

  /** The cached snapshot for `key`, or undefined when none is complete. */
  async readExisting(key: string): Promise<Snapshot | undefined> {
    let text: string;
    try {
      text = await readFile(join(this.snapshotDir(key), INFO_FILE), 'utf8');
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return undefined;
      throw snapshotWriteFailed(`${key} could not be read`, error);
    }
    const parsed = SNAPSHOT_SCHEMA.safeParse(parseJson(text));
    if (!parsed.success) {
      throw new RosettaError(
        ERROR_CODES.snapshotEntryRefused,
        `The cached snapshot ${key} has an invalid ${INFO_FILE}.`,
        { cause: parsed.error },
      );
    }
    const info: SnapshotInfo = INFO_SCHEMA.parse(parsed.data);
    return { ...info, key, rootDir: this.filesDir(key), cached: true };
  }

  /** Walks the extracted tree: counts, bytes and the `sha256:` hash of sorted path and file hash pairs. */
  inspect(filesDir: string): Promise<TreeSummary> {
    return onDisk('tree could not be read', async () => {
      const realRoot = await realpath(filesDir);
      const paths = (await listFiles(filesDir, realRoot)).sort((a, b) =>
        a < b ? -1 : a > b ? 1 : 0,
      );
      const hash = createHash('sha256');
      let totalBytes = 0;
      for (const path of paths) {
        const absolute = join(filesDir, path);
        totalBytes += (await stat(absolute)).size;
        hash.update(`${path}\0${await hashFile(absolute)}\n`);
      }
      return { fileCount: paths.length, totalBytes, snapshotHash: `sha256:${hash.digest('hex')}` };
    });
  }

  async writeInfo(dir: string, info: SnapshotInfo): Promise<void> {
    const text = `${JSON.stringify({ schemaVersion: 1, ...info }, null, 2)}\n`;
    await writeFile(join(dir, INFO_FILE), text, 'utf8').catch((error: unknown) => {
      throw snapshotWriteFailed('description could not be written', error);
    });
  }

  /**
   * Renames the partial folder to its final name. When another fetch finished first, the partial
   * folder is deleted and the existing snapshot is kept (DEC-112); returns false in that case.
   */
  async commit(partialDir: string, key: string): Promise<boolean> {
    const target = this.snapshotDir(key);
    if (await exists(target)) {
      await rm(partialDir, { recursive: true, force: true });
      return false;
    }
    try {
      await rename(partialDir, target);
      return true;
    } catch (error) {
      if (
        ['EEXIST', 'ENOTEMPTY', 'EPERM'].includes(errorCode(error) ?? '') &&
        (await exists(target))
      ) {
        await rm(partialDir, { recursive: true, force: true });
        return false;
      }
      throw snapshotWriteFailed(`${key} could not be renamed into place`, error);
    }
  }

  /** Marks files and folders read-only where the operating system allows it (RF-005). */
  makeReadOnly(dir: string): Promise<void> {
    return onDisk('could not be marked read-only', () => markReadOnly(dir));
  }

  /** Deletes every `.partial-*` folder left by an interrupted download; returns their names. */
  async discardPartials(): Promise<string[]> {
    let entries;
    try {
      entries = await readdir(this.sourcesDir, { withFileTypes: true });
    } catch (error) {
      if (errorCode(error) === 'ENOENT') return [];
      throw snapshotWriteFailed('folder could not be listed', error);
    }
    const partials = entries
      .filter((entry) => entry.isDirectory() && entry.name.startsWith(PARTIAL_PREFIX))
      .map((entry) => entry.name)
      .sort();
    for (const name of partials)
      await rm(join(this.sourcesDir, name), { recursive: true, force: true });
    return partials;
  }

  async createPartial(id: string): Promise<{ readonly dir: string; readonly filesDir: string }> {
    const dir = this.partialDir(id);
    const filesDir = join(dir, FILES);
    await mkdir(filesDir, { recursive: true }).catch((error: unknown) => {
      throw snapshotWriteFailed('folder could not be created', error);
    });
    return { dir, filesDir };
  }
}

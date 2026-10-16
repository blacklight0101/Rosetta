import { chmod, lstat, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach } from 'vitest';

const WRITABLE_FILE = 0o644;
const WRITABLE_DIR = 0o755;

/** Makes every file and folder under `path` writable again, so a read-only snapshot can be deleted. */
async function makeWritable(path: string): Promise<void> {
  await chmod(path, WRITABLE_DIR);
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      await makeWritable(child);
    } else if (entry.isFile()) {
      await chmod(child, WRITABLE_FILE);
    }
  }
}

/** Lists every file under `path` recursively, as forward-slash paths relative to it, sorted. */
export async function listTree(path: string): Promise<string[]> {
  const entries = await readdir(path, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => !entry.isDirectory())
    .map((entry) =>
      join(entry.parentPath, entry.name)
        .slice(path.length + 1)
        .replaceAll('\\', '/'),
    )
    .sort();
}

/** Removes `path` and everything under it, read-only files included; a missing path is not an error. */
export async function removeWritableTree(path: string): Promise<void> {
  try {
    // A symbolic link (or junction) as the root would send chmod to whatever it points at.
    if ((await lstat(path)).isSymbolicLink()) {
      throw new Error(`Refusing to clear ${path}: the root is a symbolic link.`);
    }
    await makeWritable(path);
  } catch (error) {
    if (isMissing(error)) return;
    throw error;
  }
  await rm(path, { recursive: true, force: true });
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

/** Like `useTempRoot`, for tests whose adapter leaves read-only trees behind (RF-005). */
export function useWritableTempRoot(prefix: string): { readonly path: string } {
  const state = { path: '' };

  beforeEach(async () => {
    state.path = await mkdtemp(join(tmpdir(), prefix));
  });

  afterEach(async () => {
    await removeWritableTree(state.path);
  });

  return state;
}

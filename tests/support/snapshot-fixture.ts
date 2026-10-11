import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';

/** Writes repository-relative files under `root`, creating folders as needed. */
export async function writeTree(
  root: string,
  files: Readonly<Record<string, string>>,
): Promise<void> {
  for (const [path, text] of Object.entries(files)) {
    const target = join(root, ...path.split('/'));
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, text, 'utf8');
  }
}

async function listTree(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

/** RF-005: a hash of every path and file content under `root`, to prove nothing changed. */
export async function hashTree(root: string): Promise<string> {
  const hash = createHash('sha256');
  for (const path of await listTree(root)) {
    hash.update(path);
    hash.update(await readFile(join(root, ...path.split('/'))));
  }
  return hash.digest('hex');
}

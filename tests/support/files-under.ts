import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// Tests: every file under a folder by its path inside it.

/** The files under the folder; none when the folder does not exist. */
export async function filesUnder(root: string): Promise<Record<string, string>> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(
    (error: unknown) => {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return [];
      throw error;
    },
  );
  const files: Record<string, string> = {};
  for (const entry of entries.filter((each) => each.isFile())) {
    const absolute = join(entry.parentPath, entry.name);
    const path = absolute
      .slice(root.length + 1)
      .split('\\')
      .join('/');
    files[path] = await readFile(absolute, 'utf8');
  }
  return files;
}

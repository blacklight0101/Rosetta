import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

// RF-008: the tree of a folder as `relative path -> content`, a directory as `path/ -> null`, for
// comparing a folder with the unzipped archive of it.

export type Tree = Readonly<Record<string, Buffer | null>>;

async function walk(root: string, relative: string, into: Record<string, Buffer | null>) {
  const entries = await readdir(join(root, relative), { withFileTypes: true });
  for (const entry of entries) {
    const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
    if (entry.isDirectory()) {
      into[`${path}/`] = null;
      await walk(root, path, into);
    } else if (entry.isFile()) {
      into[path] = await readFile(join(root, path));
    }
  }
}

/** The files and folders below `root`, links left out. */
export async function treeOf(root: string): Promise<Tree> {
  const tree: Record<string, Buffer | null> = {};
  await walk(root, '', tree);
  return tree;
}

/** The same shape for the entries of a zip, with every name below `prefix` made relative. */
export function treeOfEntries(
  entries: readonly { readonly name: string; readonly directory: boolean; readonly data: Buffer }[],
  prefix: string,
): Tree {
  const tree: Record<string, Buffer | null> = {};
  for (const entry of entries) {
    if (!entry.name.startsWith(prefix)) throw new Error(`${entry.name} is outside ${prefix}`);
    const relative = entry.name.slice(prefix.length);
    if (relative !== '') tree[relative] = entry.directory ? null : entry.data;
  }
  return tree;
}

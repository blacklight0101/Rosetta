import { readdir, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

// RF-122, ADR-008: a folder of the repository packed as the archive GitHub serves for a commit (one
// top-level folder, `<owner>-<repo>-<short sha>/`), so the end-to-end server can offer a fixture
// repository to its fake GitHub. A small ustar writer, as in scripts/make-snapshot-fixtures.mjs;
// paths stay under 100 bytes. Entries are sorted, so the archive is the same on every run.

const BLOCK = 512;
const FILE = '0' as const;
const DIRECTORY = '5' as const;

interface Entry {
  readonly path: string;
  readonly type: typeof FILE | typeof DIRECTORY;
  readonly content: Buffer;
}

function octal(value: number, length: number): string {
  return `${value.toString(8).padStart(length - 1, '0')}\0`;
}

function header(entry: Entry): Buffer {
  const buffer = Buffer.alloc(BLOCK);
  buffer.write(entry.path, 0, 100, 'utf8');
  buffer.write(octal(entry.type === DIRECTORY ? 0o755 : 0o644, 8), 100, 8, 'ascii');
  buffer.write(octal(0, 8), 108, 8, 'ascii');
  buffer.write(octal(0, 8), 116, 8, 'ascii');
  buffer.write(octal(entry.content.length, 12), 124, 12, 'ascii');
  buffer.write(octal(0, 12), 136, 12, 'ascii');
  buffer.write('        ', 148, 8, 'ascii');
  buffer.write(entry.type, 156, 1, 'ascii');
  buffer.write('ustar\0', 257, 6, 'ascii');
  buffer.write('00', 263, 2, 'ascii');
  const sum = buffer.reduce((total, byte) => total + byte, 0);
  buffer.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return buffer;
}

function blocksOf(entry: Entry): Buffer[] {
  const parts = [header(entry)];
  if (entry.content.length > 0) {
    parts.push(entry.content, Buffer.alloc((BLOCK - (entry.content.length % BLOCK)) % BLOCK));
  }
  return parts;
}

async function filesOf(folder: string): Promise<string[]> {
  const entries = await readdir(folder, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

/** The gzip-compressed tar archive of `folder`, every path under `<top>/`. */
export async function archiveOfFolder(folder: string, top: string): Promise<Buffer> {
  const paths = await filesOf(folder);
  const directories = [...new Set(paths.flatMap((path) => parentsOf(path)))].sort();
  const entries: Entry[] = [
    { path: `${top}/`, type: DIRECTORY, content: Buffer.alloc(0) },
    ...directories.map((path) => ({
      path: `${top}/${path}/`,
      type: DIRECTORY,
      content: Buffer.alloc(0),
    })),
  ];
  for (const path of paths) {
    const content = await readFile(join(folder, ...path.split('/')));
    entries.push({ path: `${top}/${path}`, type: FILE, content });
  }
  const parts = entries.flatMap((entry) => blocksOf(entry));
  parts.push(Buffer.alloc(BLOCK * 2));
  return gzipSync(Buffer.concat(parts), { level: 9 });
}

/** `a/b/c.cs` gives `a` and `a/b`. */
function parentsOf(path: string): string[] {
  const segments = path.split('/').slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
}

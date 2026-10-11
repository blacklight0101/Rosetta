// RF-122, RF-127: writes the fixture archives under tests/fixtures/snapshots/ with a small ustar
// writer, so hostile entries (path traversal, absolute paths, symbolic and hard links) can be built
// on any operating system. Usage: node scripts/make-snapshot-fixtures.mjs
// The archives are committed; run this only to regenerate them after changing a fixture.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';

const gzipAsync = promisify(gzip);

const BLOCK = 512;
const TYPE = { file: '0', hardLink: '1', symlink: '2', directory: '5' };

function octal(value, length) {
  return `${value.toString(8).padStart(length - 1, '0')}\0`;
}

function header(entry) {
  const buffer = Buffer.alloc(BLOCK);
  buffer.write(entry.path, 0, 100, 'utf8');
  buffer.write(octal(entry.mode ?? 0o644, 8), 100, 8, 'ascii');
  buffer.write(octal(0, 8), 108, 8, 'ascii');
  buffer.write(octal(0, 8), 116, 8, 'ascii');
  buffer.write(octal(entry.size ?? 0, 12), 124, 12, 'ascii');
  buffer.write(octal(0, 12), 136, 12, 'ascii');
  buffer.write('        ', 148, 8, 'ascii');
  buffer.write(entry.type, 156, 1, 'ascii');
  if (entry.linkPath !== undefined) buffer.write(entry.linkPath, 157, 100, 'utf8');
  buffer.write('ustar\0', 257, 6, 'ascii');
  buffer.write('00', 263, 2, 'ascii');
  let sum = 0;
  for (const byte of buffer) sum += byte;
  buffer.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'ascii');
  return buffer;
}

function tar(entries) {
  const parts = [];
  for (const entry of entries) {
    const data = entry.content === undefined ? Buffer.alloc(0) : Buffer.from(entry.content);
    parts.push(header({ ...entry, size: data.length }));
    if (data.length > 0) {
      parts.push(data);
      const padding = (BLOCK - (data.length % BLOCK)) % BLOCK;
      if (padding > 0) parts.push(Buffer.alloc(padding));
    }
  }
  parts.push(Buffer.alloc(BLOCK * 2));
  return gzipAsync(Buffer.concat(parts), { level: 9 });
}

const top = 'octo-demo-3f78685';
const file = (path, content) => ({ type: TYPE.file, path: `${top}/${path}`, content });
const directory = (path) => ({ type: TYPE.directory, path: `${top}/${path}/`, mode: 0o755 });

const normal = [
  { type: TYPE.directory, path: `${top}/`, mode: 0o755 },
  file('.rosettaignore', '*.pfx\n'),
  file('README.md', '# Demo\n\nA small fixture repository for the snapshot tests.\n'),
  directory('src'),
  file('src/App.cs', 'namespace Demo { public class App { } }\n'),
  file('src/lib/Util.cs', 'namespace Demo.Lib { public static class Util { } }\n'),
];

const fixtures = {
  'normal.tar.gz': normal,
  'traversal.tar.gz': [
    ...normal,
    file('../../escaped.txt', 'must never be written\n'),
    { type: TYPE.file, path: '/abs/absolute.txt', content: 'must never be written\n' },
  ],
  'links.tar.gz': [
    ...normal,
    { type: TYPE.symlink, path: `${top}/link-to-readme`, linkPath: 'README.md' },
    { type: TYPE.hardLink, path: `${top}/hard-readme`, linkPath: `${top}/README.md` },
  ],
  'oversized.tar.gz': [
    { type: TYPE.directory, path: `${top}/`, mode: 0o755 },
    file('big.bin', 'x'.repeat(64 * 1024)),
  ],
  'many-entries.tar.gz': [
    { type: TYPE.directory, path: `${top}/`, mode: 0o755 },
    ...Array.from({ length: 30 }, (_, index) =>
      file(`f/${String(index).padStart(2, '0')}.txt`, `${String(index)}\n`),
    ),
  ],
};

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'tests', 'fixtures', 'snapshots');
await mkdir(out, { recursive: true });
for (const [name, entries] of Object.entries(fixtures)) {
  await writeFile(join(out, name), await tar(entries));
  process.stdout.write(`wrote ${name}\n`);
}

import { mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { YauzlZipExtractor } from '../../../../src/infrastructure/sources/zip-extractor.js';
import { DEFAULT_ZIP_LIMITS } from '../../../../src/infrastructure/sources/zip-limits.js';
import { extractZip, targetExists, targetOf } from '../../../support/zip-extract-harness.js';
import { buildRawNameZip, buildZip, patchCentral } from '../../../support/zip-fixtures.js';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-zip-');

describe('YauzlZipExtractor the tree it writes', () => {
  it('RF-130 removes the single top-level folder from every path', async () => {
    const zip = await buildZip([
      { name: 'OrderDesk/src/Orders.cs', data: 'class Orders {}' },
      { name: 'OrderDesk/README.md', data: '# Order desk' },
    ]);

    const result = await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['README.md', 'src/Orders.cs']);
    expect(result).toEqual({
      keptFiles: 2,
      skippedLinks: 0,
      skippedDeviceNames: 0,
      leftOutEntries: 0,
    });
  });

  it('RF-130 keeps every path when there are two top-level folders', async () => {
    const zip = await buildZip([
      { name: 'one/a.cs', data: 'a' },
      { name: 'two/b.cs', data: 'b' },
    ]);

    await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['one/a.cs', 'two/b.cs']);
  });

  it('RF-130 keeps every path when a file sits beside the only folder', async () => {
    const zip = await buildZip([
      { name: 'README.md', data: 'r' },
      { name: 'src/a.cs', data: 'a' },
    ]);

    await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['README.md', 'src/a.cs']);
  });

  it('RF-130 does not strip a single file at the top', async () => {
    const zip = await buildZip([{ name: 'only.txt', data: 'x' }]);

    await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['only.txt']);
  });
});

describe('YauzlZipExtractor the files it writes', () => {
  it('RF-129 writes stored and deflated entries byte for byte', async () => {
    const stored = Buffer.from(Array.from({ length: 3000 }, (_, i) => (i * 31 + 7) % 251));
    const zip = await buildZip([
      { name: 'p/stored.bin', data: stored, compress: false },
      { name: 'p/deflated.txt', data: 'line\n'.repeat(500) },
    ]);

    await extractZip(root.path, zip);

    const target = targetOf(root.path);
    expect(await readFile(join(target, 'stored.bin'))).toEqual(stored);
    expect(await readFile(join(target, 'deflated.txt'), 'utf8')).toBe('line\n'.repeat(500));
  });

  it('RF-129 creates folders from file paths only, never from directory entries', async () => {
    const zip = await buildZip([
      { name: 'proj/empty/', directory: true },
      { name: 'proj/a.txt', data: 'a' },
    ]);

    await extractZip(root.path, zip);

    expect(await readdir(targetOf(root.path))).toEqual(['a.txt']);
  });

  it('RF-129 reads a ZIP64 archive', async () => {
    const zip = await buildZip([{ name: 'p/a.txt', data: 'sixty-four' }], { zip64: true });

    const result = await extractZip(root.path, zip);

    expect(await readFile(join(targetOf(root.path), 'a.txt'), 'utf8')).toBe('sixty-four');
    expect(result.keptFiles).toBe(1);
  });
});

describe('YauzlZipExtractor how it reads names and folders', () => {
  it('RF-129 treats a backslash as a separator, as old Windows zip tools write it', async () => {
    const zip = await buildRawNameZip([
      { name: 'p\\src\\ok.txt', data: 'o' },
      { name: 'p/b.txt', data: 'b' },
    ]);

    await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['b.txt', 'src/ok.txt']);
  });

  it('RF-129 ignores empty and dot segments in a path', async () => {
    const zip = await buildRawNameZip([
      { name: './p/a.txt', data: 'a' },
      { name: 'p//b.txt', data: 'b' },
    ]);

    await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['a.txt', 'b.txt']);
  });

  it('RF-129 reads a name flagged as UTF-8 as UTF-8 and any other name byte for byte', async () => {
    const flagged = await buildZip([{ name: 'p/é.txt', data: 'e' }]);
    const unflagged = patchCentral(flagged, 'p/é.txt', { flags: 0 });

    await extractZip(root.path, flagged);
    expect(await listTree(targetOf(root.path))).toEqual(['é.txt']);

    await rm(targetOf(root.path), { recursive: true });
    await extractZip(root.path, unflagged);
    expect(await listTree(targetOf(root.path))).toEqual(['Ã©.txt']);
  });

  it('RF-129 extracts into a destination folder that already exists', async () => {
    const zip = await buildZip([{ name: 'p/a.txt', data: 'a' }]);
    await mkdir(targetOf(root.path), { recursive: true });

    await extractZip(root.path, zip);

    expect(await listTree(targetOf(root.path))).toEqual(['a.txt']);
  });
});

describe('YauzlZipExtractor what it refuses to read', () => {
  it('RF-129 a file that is not a zip stops with RST-1909 and leaves no folder', async () => {
    const notZip = Buffer.from('this is plain text, not an archive '.repeat(10));

    await expect(extractZip(root.path, notZip)).rejects.toMatchObject({ code: 'RST-1909' });
    expect(await targetExists(root.path)).toBe(false);
  });

  it('RF-129 a zip cut off half way stops with RST-1909', async () => {
    const zip = await buildZip([{ name: 'p/a.txt', data: 'a'.repeat(2000) }]);

    await expect(extractZip(root.path, zip.subarray(0, 60))).rejects.toMatchObject({
      code: 'RST-1909',
    });
  });

  it('RF-129 an empty zip stops with RST-1915', async () => {
    const zip = await buildZip([]);

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1915' });
    expect(await targetExists(root.path)).toBe(false);
  });

  it('RF-129 a zip whose only content is left out stops with RST-1915', async () => {
    const zip = await buildZip([
      { name: 'node_modules/a/index.js', data: 'x' },
      { name: '.git/config', data: 'y' },
    ]);

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1915' });
    expect(await targetExists(root.path)).toBe(false);
  });

  it('RF-129 a zip with only directories and links stops with RST-1915', async () => {
    const zip = await buildZip([
      { name: 'p/', directory: true },
      { name: 'p/link', data: 'target', mode: 0o120777 },
    ]);

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1915' });
  });

  it('RF-129 a zip whose only file has a Windows device name stops with RST-1915', async () => {
    const zip = await buildZip([{ name: 'p/aux.c', data: 'x' }]);

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1915' });
  });
});

describe('YauzlZipExtractor failures', () => {
  it('RF-129 a failure after some files were written deletes the whole destination', async () => {
    const lying = Buffer.from(Array.from({ length: 4000 }, (_, i) => (i * 17 + 3) % 253));
    const zip = patchCentral(
      await buildZip([
        { name: 'p/a-first.txt', data: 'written first' },
        { name: 'p/b-lying.bin', data: lying, compress: false },
      ]),
      'p/b-lying.bin',
      { uncompressedSize: 10 },
    );

    await expect(extractZip(root.path, zip, { maxBytes: 1000 })).rejects.toMatchObject({
      code: 'RST-1910',
    });
    expect(await targetExists(root.path)).toBe(false);
  });

  it('RF-129 a failure also deletes a destination folder that existed before', async () => {
    const zip = await buildZip([
      { name: 'p/a.txt', data: 'one' },
      { name: 'p/a.txt', data: 'two' },
    ]);
    await mkdir(targetOf(root.path), { recursive: true });

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1908' });
    expect(await targetExists(root.path)).toBe(false);
  });

  it('RF-129 an entry name that appears twice stops with RST-1908 and leaves no folder', async () => {
    const zip = await buildZip([
      { name: 'p/same.txt', data: 'one' },
      { name: 'p/same.txt', data: 'two' },
    ]);

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1908' });
    expect(await targetExists(root.path)).toBe(false);
  });
});

describe('YauzlZipExtractor failures of the request', () => {
  it('RF-129 a zip file that is missing stops with RST-1908', async () => {
    const extractor = new YauzlZipExtractor(DEFAULT_ZIP_LIMITS);

    await expect(
      extractor.extract(
        join(root.path, 'missing.zip'),
        targetOf(root.path),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: 'RST-1908' });
  });

  it('RF-129 a request that was already cancelled writes nothing', async () => {
    const zip = await buildZip([{ name: 'p/a.txt', data: 'a' }]);
    const controller = new AbortController();
    controller.abort();

    await expect(extractZip(root.path, zip, {}, controller.signal)).rejects.toMatchObject({
      name: 'AbortError',
    });
    expect(await targetExists(root.path)).toBe(false);
  });
});

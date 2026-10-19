import { describe, expect, it } from 'vitest';
import { extractZip, targetExists } from '../../../support/zip-extract-harness.js';
import { buildZip, patchCentral } from '../../../support/zip-fixtures.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-zip-limits-');

/** Bytes that do not compress, so a stored or deflated entry keeps a ratio near 1. */
function noise(length: number): Buffer {
  return Buffer.from(Array.from({ length }, (_, i) => (i * 131 + (i >> 3) * 7) % 251));
}

describe('YauzlZipExtractor limits from the central directory', () => {
  it('RF-129 more entries than the limit stop with RST-1911 before anything is written', async () => {
    const zip = await buildZip([
      { name: 'p/a.txt', data: 'a' },
      { name: 'p/b.txt', data: 'b' },
      { name: 'p/c.txt', data: 'c' },
      { name: 'p/d.txt', data: 'd' },
    ]);

    await expect(extractZip(root.path, zip, { maxEntries: 3 })).rejects.toMatchObject({
      code: 'RST-1911',
    });
    expect(await targetExists(root.path)).toBe(false);
  });

  it('RF-129 as many entries as the limit are accepted', async () => {
    const zip = await buildZip([
      { name: 'p/a.txt', data: 'a' },
      { name: 'p/b.txt', data: 'b' },
      { name: 'p/c.txt', data: 'c' },
    ]);

    const result = await extractZip(root.path, zip, { maxEntries: 3 });

    expect(result.keptFiles).toBe(3);
  });
});

describe('YauzlZipExtractor total size from the central directory', () => {
  it('RF-129 a total uncompressed size above the limit stops with RST-1910 before anything is written', async () => {
    const zip = await buildZip([
      { name: 'p/a.bin', data: noise(600), compress: false },
      { name: 'p/b.bin', data: noise(600), compress: false },
    ]);

    await expect(extractZip(root.path, zip, { maxBytes: 1000 })).rejects.toMatchObject({
      code: 'RST-1910',
    });
    expect(await targetExists(root.path)).toBe(false);
  });

  it('RF-129 a total size equal to the limit is accepted', async () => {
    const zip = await buildZip([
      { name: 'p/a.bin', data: noise(500), compress: false },
      { name: 'p/b.bin', data: noise(500), compress: false },
    ]);

    const result = await extractZip(root.path, zip, { maxBytes: 1000 });

    expect(result.keptFiles).toBe(2);
  });

  it('RF-129 entries that are left out still count toward the total size', async () => {
    const zip = await buildZip([
      { name: 'p/a.txt', data: 'a' },
      { name: 'p/node_modules/big.bin', data: noise(2000), compress: false },
    ]);

    await expect(extractZip(root.path, zip, { maxBytes: 1000 })).rejects.toMatchObject({
      code: 'RST-1910',
    });
  });
});

describe('YauzlZipExtractor limits while writing', () => {
  it('RF-129 a central directory that understates sizes is stopped by the written-byte count', async () => {
    const zip = patchCentral(
      await buildZip([{ name: 'p/lie.bin', data: noise(5000), compress: false }]),
      'p/lie.bin',
      { uncompressedSize: 10 },
    );

    await expect(extractZip(root.path, zip, { maxBytes: 1000 })).rejects.toMatchObject({
      code: 'RST-1910',
    });
    expect(await targetExists(root.path)).toBe(false);
  });

  it('RF-129 an entry larger than its declared size, within the limit, stops with RST-1909', async () => {
    const zip = patchCentral(
      await buildZip([{ name: 'p/lie.bin', data: noise(300), compress: false }]),
      'p/lie.bin',
      { uncompressedSize: 50 },
    );

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1909' });
    expect(await targetExists(root.path)).toBe(false);
  });

  it('RF-129 an entry smaller than its declared size stops with RST-1909', async () => {
    const zip = patchCentral(
      await buildZip([{ name: 'p/lie.txt', data: noise(100), compress: true }]),
      'p/lie.txt',
      { uncompressedSize: 5000 },
    );

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1909' });
  });
});

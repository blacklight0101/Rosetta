import { describe, expect, it } from 'vitest';
import { extractZip, targetExists } from '../../../support/zip-extract-harness.js';
import { buildZip, type ZipItem } from '../../../support/zip-fixtures.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-zip-ratio-');

const MIB = 1024 * 1024;

/** Pseudo-random bytes (a fixed xorshift sequence) that deflate cannot shrink. */
function noise(length: number): Buffer {
  const bytes = Buffer.alloc(length);
  let state = 0x2545f491;
  for (let i = 0; i < length; i += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    bytes[i] = state & 0xff;
  }
  return bytes;
}

/** `count` small entries of 1 MiB each: zeros plus a little noise, so the overall ratio is near 300 : 1. */
function smallEntries(count: number, prefix = 'p'): ZipItem[] {
  return Array.from({ length: count }, (_, i) => ({
    name: `${prefix}/f${String(i)}.bin`,
    data: Buffer.concat([noise(2400), Buffer.alloc(MIB - 2400, 0)]),
  }));
}

describe('YauzlZipExtractor the per-entry compression ratio (RF-129, DEC-151)', () => {
  it('RF-129 a 5 MiB entry at about 300 : 1 and above stops with RST-1912 before anything is written', async () => {
    const zip = await buildZip([
      { name: 'p/ok.txt', data: 'fine' },
      { name: 'p/bomb.bin', data: Buffer.concat([noise(8000), Buffer.alloc(5 * MIB - 8000, 0)]) },
    ]);

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1912' });
    expect(await targetExists(root.path)).toBe(false);
  });

  it('RF-129 a 1 MiB file of one repeated byte is accepted', async () => {
    const zip = await buildZip([{ name: 'p/zeros.bin', data: Buffer.alloc(MIB, 0) }]);

    const result = await extractZip(root.path, zip);

    expect(result.keptFiles).toBe(1);
  });

  it('RF-129 an entry of exactly 4 MiB is not checked for ratio', async () => {
    const zip = await buildZip([{ name: 'p/zeros.bin', data: Buffer.alloc(4 * MIB, 0) }]);

    const result = await extractZip(root.path, zip);

    expect(result.keptFiles).toBe(1);
  });

  it('RF-129 the ratio limit is a setting: the same large entry passes under a higher one', async () => {
    const zip = await buildZip([{ name: 'p/zeros.bin', data: Buffer.alloc(5 * MIB, 0) }]);

    const result = await extractZip(root.path, zip, { maxRatio: 100_000 });

    expect(result.keptFiles).toBe(1);
  });

  it('RF-129 the ratio of an entry that is left out is not judged', async () => {
    const zip = await buildZip([
      { name: 'p/ok.txt', data: 'fine' },
      { name: 'p/node_modules/zeros.bin', data: Buffer.alloc(5 * MIB, 0) },
    ]);

    const result = await extractZip(root.path, zip);

    expect(result.keptFiles).toBe(1);
  });
});

describe('YauzlZipExtractor the archive-wide compression ratio (RF-129, DEC-151)', () => {
  it('RF-129 many small entries above 64 MiB at 300 : 1 overall stop with RST-1912 before anything is written', async () => {
    const zip = await buildZip(smallEntries(66));

    await expect(extractZip(root.path, zip)).rejects.toMatchObject({ code: 'RST-1912' });
    expect(await targetExists(root.path)).toBe(false);
  });

  it('RF-129 an archive of 60 MiB at 300 : 1 overall made of small entries is accepted', async () => {
    const zip = await buildZip(smallEntries(60));

    const result = await extractZip(root.path, zip);

    expect(result.keptFiles).toBe(60);
  });

  it('RF-129 an archive above 64 MiB that compresses less than 200 : 1 overall is accepted', async () => {
    const entries = Array.from({ length: 66 }, (_, i) => ({
      name: `p/f${String(i)}.bin`,
      data: Buffer.concat([noise(20_000), Buffer.alloc(MIB - 20_000, 0)]),
    }));
    const zip = await buildZip(entries);

    const result = await extractZip(root.path, zip);

    expect(result.keptFiles).toBe(66);
  });

  it('RF-129 the archive-wide check uses the ratio setting', async () => {
    const zip = await buildZip(smallEntries(66));

    const result = await extractZip(root.path, zip, { maxRatio: 100_000 });

    expect(result.keptFiles).toBe(66);
  });
});

import { describe, expect, it } from 'vitest';
import {
  extractTarball,
  type ExtractionLimits,
} from '../../../../src/infrastructure/github/tarball-extractor.js';
import {
  streamOf,
  TAR_TOP,
  TAR_TYPE,
  tarBytes,
  tarFile,
  tarGz,
  type TarEntry,
} from '../../../support/tar-builder.js';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';

// RF-127, P1-160 (F-05): the byte limit counts what the archive decompresses to, not only the
// sizes its regular files declare.

const root = useWritableTempRoot('rosetta-extractor-bytes-');
const KIB = 1024;
const MIB = 1024 * KIB;
const top: TarEntry = { path: `${TAR_TOP}/`, type: TAR_TYPE.directory };

function extract(archive: Buffer, limits: Partial<ExtractionLimits>): Promise<unknown> {
  return extractTarball(
    streamOf(archive),
    root.path,
    { maxEntries: 100_000, maxBytes: 64 * MIB, ...limits },
    new AbortController().signal,
  );
}

describe('extractTarball decompressed bytes', () => {
  it('RF-127 a zip bomb of zeros after the end of the archive stops with RST-1905', async () => {
    const archive = await tarGz([top, tarFile('a.txt', 'small\n')], {
      trailing: Buffer.alloc(4 * MIB),
    });
    expect(archive.length).toBeLessThan(16 * KIB);

    await expect(extract(archive, { maxBytes: MIB })).rejects.toMatchObject({ code: 'RST-1905' });
  });

  it('RF-127 a header that declares a small size followed by a large zero body stops with RST-1905', async () => {
    const lying: TarEntry = { ...tarFile('a.txt', Buffer.alloc(3 * MIB)), declaredSize: 10 };
    const archive = await tarGz([top, lying], { noEnd: true });

    await expect(extract(archive, { maxBytes: MIB })).rejects.toMatchObject({ code: 'RST-1905' });
  });

  it('RF-127 many tiny entries count their headers against the byte limit', async () => {
    const entries = Array.from({ length: 300 }, (_, index) => tarFile(`f/${String(index)}`, ''));
    const archive = await tarGz([top, ...entries]);

    await expect(extract(archive, { maxBytes: 64 * KIB })).rejects.toMatchObject({
      code: 'RST-1905',
    });
  });
});

describe('extractTarball skipped entries', () => {
  it('RF-127 the body of a skipped entry counts against the byte limit', async () => {
    const fifo: TarEntry = {
      path: `${TAR_TOP}/pipe`,
      type: TAR_TYPE.fifo,
      body: Buffer.alloc(2 * MIB),
    };
    const archive = await tarGz([top, fifo, tarFile('a.txt', 'small\n')]);

    await expect(extract(archive, { maxBytes: MIB })).rejects.toMatchObject({ code: 'RST-1905' });
  });

  it('RF-127 the declared size of a skipped entry counts before its body arrives', async () => {
    const fifo: TarEntry = { path: `${TAR_TOP}/pipe`, type: TAR_TYPE.fifo, declaredSize: 8 * MIB };
    const archive = await tarGz([top, fifo], { noEnd: true });

    await expect(extract(archive, { maxBytes: MIB })).rejects.toMatchObject({ code: 'RST-1905' });
  });
});

describe('extractTarball metadata and boundaries', () => {
  it('RF-127 a metadata entry too large for the parser to read still counts', async () => {
    const pax: TarEntry = {
      path: `${TAR_TOP}/PaxHeader`,
      type: TAR_TYPE.paxHeader,
      body: Buffer.alloc(2 * MIB, 0x20),
    };
    const archive = await tarGz([top, pax, tarFile('a.txt', 'small\n')]);

    await expect(extract(archive, { maxBytes: MIB + 512 * KIB })).rejects.toMatchObject({
      code: 'RST-1905',
    });
  });

  it('RF-127 an archive that decompresses to exactly the limit is extracted', async () => {
    const entries = [top, tarFile('a.txt', 'exact\n')];
    const size = tarBytes(entries).length;

    await expect(extract(await tarGz(entries), { maxBytes: size })).resolves.toEqual({
      skippedLinks: 0,
    });
    expect(await listTree(root.path)).toEqual(['a.txt']);
  });

  it('RF-127 an archive that decompresses to one byte over the limit stops with RST-1905', async () => {
    const entries = [top, tarFile('a.txt', 'exact\n')];
    const size = tarBytes(entries).length;

    await expect(extract(await tarGz(entries), { maxBytes: size - 1 })).rejects.toMatchObject({
      code: 'RST-1905',
    });
  });

  it('RF-127 nothing after the limit reaches the disk', async () => {
    const first = tarFile('first.txt', Buffer.alloc(200 * KIB, 0x61));
    const later = Array.from({ length: 8 }, (_, index) =>
      tarFile(`later-${String(index)}.txt`, Buffer.alloc(200 * KIB, 0x62)),
    );
    const archive = await tarGz([top, first, ...later]);

    await expect(extract(archive, { maxBytes: 300 * KIB })).rejects.toMatchObject({
      code: 'RST-1905',
    });
    expect(await listTree(root.path)).not.toContain('later-1.txt');
  });
});

describe('extractTarball after a refusal', () => {
  it('RF-122 no later chunk of the archive is parsed once an entry is refused', async () => {
    const escape: TarEntry = { path: `${TAR_TOP}/../escaped.txt`, body: Buffer.from('x') };
    const later = Array.from({ length: 64 }, (_, index) =>
      tarFile(`later-${String(index)}.txt`, Buffer.alloc(4 * KIB, 0x63)),
    );
    const archive = await tarGz([top, escape, ...later]);

    await expect(extract(archive, {})).rejects.toMatchObject({ code: 'RST-1906' });
    expect(await listTree(root.path)).not.toContain('later-63.txt');
  });
});

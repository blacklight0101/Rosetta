import { describe, expect, it } from 'vitest';
import type { ZipExtractor } from '../../../../src/application/ports/zip-extractor.js';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';
import {
  bodyOf,
  countingBody,
  endlessZipLike,
  MB,
  requestOf,
  sampleZip,
  sourcesEntries,
  storeIn,
} from '../../../support/upload-store-harness.js';
import { buildRawNameZip, buildZip } from '../../../support/zip-fixtures.js';

// RF-128, RF-129, RFC-004 section 4.2: every refusal of the upload store, over a real folder and
// the real extractor. Every failure leaves nothing in `<data>/sources/`.

const root = useWritableTempRoot('rosetta-upload-refused-');

describe('ZipUploadStore the size limit', () => {
  it('RF-129 refuses a declared length above the limit before reading a byte', async () => {
    const counted = countingBody(await sampleZip());

    await expect(
      storeIn(root.path).store(requestOf(counted.body, { declaredBytes: MB + 1 })),
    ).rejects.toMatchObject({ code: 'RST-1916' });

    expect(counted.reads()).toBe(0);
    expect(await sourcesEntries(root.path)).toEqual([]);
  });

  it('RF-129 stops a body without a declared length at the limit and deletes the temporary file', async () => {
    await expect(storeIn(root.path).store(requestOf(endlessZipLike()))).rejects.toMatchObject({
      code: 'RST-1916',
    });

    expect(await sourcesEntries(root.path)).toEqual([]);
  });

  it('RF-129 stops a body longer than the length it declared', async () => {
    const filler = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(2 * MB)]);

    await expect(
      storeIn(root.path).store(requestOf(bodyOf(filler), { declaredBytes: 100 })),
    ).rejects.toMatchObject({ code: 'RST-1916' });

    expect(await sourcesEntries(root.path)).toEqual([]);
  });

  it('RF-129 accepts a body exactly at the limit', async () => {
    const zip = await sampleZip();

    const stored = await storeIn(root.path).store(
      requestOf(bodyOf(zip), { limitBytes: zip.length, declaredBytes: zip.length }),
    );

    expect(stored.zipBytes).toBe(zip.length);
  });
});

describe('ZipUploadStore free space', () => {
  it('RF-129 refuses with RST-1917 when the free space is under twice the limit, before any byte', async () => {
    const counted = countingBody(await sampleZip());
    const store = storeIn(root.path, { freeBytes: () => Promise.resolve(2 * MB - 1) });

    await expect(store.store(requestOf(counted.body))).rejects.toMatchObject({ code: 'RST-1917' });

    expect(counted.reads()).toBe(0);
    expect(await sourcesEntries(root.path)).toEqual([]);
  });

  it('RF-129 accepts when the free space is exactly twice the limit', async () => {
    const store = storeIn(root.path, { freeBytes: () => Promise.resolve(2 * MB) });

    const stored = await store.store(requestOf(bodyOf(await sampleZip())));

    expect(stored.info.fileCount).toBe(2);
  });
});

describe('ZipUploadStore refusals leave nothing behind', () => {
  it.each([
    ['text', Buffer.from('this is not a zip file at all')],
    ['two bytes', Buffer.from('PK')],
    ['nothing', Buffer.alloc(0)],
  ])('RF-128 a body of %s is refused as RST-1909', async (_name, bytes) => {
    await expect(storeIn(root.path).store(requestOf(bodyOf(bytes)))).rejects.toMatchObject({
      code: 'RST-1909',
    });

    expect(await sourcesEntries(root.path)).toEqual([]);
  });

  it('RF-129 a zip with an entry outside the folder is refused as RST-1913', async () => {
    const hostile = await buildRawNameZip([{ name: '../x.c', data: 'x' }]);

    await expect(storeIn(root.path).store(requestOf(bodyOf(hostile)))).rejects.toMatchObject({
      code: 'RST-1913',
    });

    expect(await sourcesEntries(root.path)).toEqual([]);
  });

  it('RF-129 an empty zip is refused as RST-1915', async () => {
    const zip = await buildZip([]);

    await expect(storeIn(root.path).store(requestOf(bodyOf(zip)))).rejects.toMatchObject({
      code: 'RST-1915',
    });

    expect(await sourcesEntries(root.path)).toEqual([]);
  });
});

describe('ZipUploadStore a request that ends early leaves nothing behind', () => {
  it('RF-128 a body that fails half way (the client went away) leaves no temporary file', async () => {
    const zip = await sampleZip();
    const broken = (async function* () {
      yield zip.subarray(0, 40);
      await Promise.resolve();
      throw new Error('aborted');
    })();

    await expect(storeIn(root.path).store(requestOf(broken))).rejects.toThrow('aborted');

    expect(await sourcesEntries(root.path)).toEqual([]);
  });

  it('RF-128 an aborted request stops the upload and leaves no temporary file', async () => {
    const controller = new AbortController();
    const slow = (async function* () {
      yield Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      controller.abort();
      await new Promise((resolve) => setTimeout(resolve, 20));
      yield Buffer.alloc(1024);
    })();

    await expect(
      storeIn(root.path).store(requestOf(slow, { signal: controller.signal })),
    ).rejects.toBeDefined();

    expect(await sourcesEntries(root.path)).toEqual([]);
  });

  it('RF-129 a client that stops sending is cut off with RST-1918', async () => {
    const stalled = (async function* () {
      yield Buffer.from([0x50, 0x4b, 0x03, 0x04]);
      await new Promise(() => undefined);
    })();
    const store = storeIn(root.path, { stallMs: 50 });

    await expect(store.store(requestOf(stalled))).rejects.toMatchObject({ code: 'RST-1918' });

    expect(await sourcesEntries(root.path)).toEqual([]);
  });
});

interface Seen {
  existed?: boolean;
  target?: string;
}

/** An extractor that waits until it is aborted, and remembers whether its destination existed. */
function hangingExtractor(seen: Seen): ZipExtractor {
  return {
    async extract(_zipPath, targetDir, signal) {
      seen.target = targetDir;
      seen.existed = await listTree(targetDir).then(
        () => true,
        () => false,
      );
      await new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(signal.reason instanceof Error ? signal.reason : new Error('aborted'));
        });
      });
      throw new Error('unreachable');
    },
  };
}

describe('ZipUploadStore time bound', () => {
  it('RF-129 stops an extraction that takes too long with RST-1918 and deletes the folder', async () => {
    const store = storeIn(root.path, { extractor: hangingExtractor({}), extractTimeoutMs: 50 });

    await expect(store.store(requestOf(bodyOf(await sampleZip())))).rejects.toMatchObject({
      code: 'RST-1918',
    });

    expect(await sourcesEntries(root.path)).toEqual([]);
  });

  it('RF-129 gives the extractor a destination that does not exist yet', async () => {
    const seen: Seen = {};
    const store = storeIn(root.path, { extractor: hangingExtractor(seen), extractTimeoutMs: 20 });

    await store.store(requestOf(bodyOf(await sampleZip()))).catch(() => undefined);

    expect(seen.existed).toBe(false);
    expect(seen.target).toContain('.partial-');
  });

  it('RF-128 a request aborted during extraction stops it, with the abort and not RST-1918', async () => {
    const controller = new AbortController();
    const store = storeIn(root.path, { extractor: hangingExtractor({}), extractTimeoutMs: 5000 });
    const pending = store.store(
      requestOf(bodyOf(await sampleZip()), { signal: controller.signal }),
    );
    setTimeout(() => {
      controller.abort(new Error('client gone'));
    }, 50);

    await expect(pending).rejects.toThrow('client gone');

    expect(await sourcesEntries(root.path)).toEqual([]);
  });
});

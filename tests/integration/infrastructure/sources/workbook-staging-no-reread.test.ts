import type * as Fs from 'node:fs';
import type * as FsPromises from 'node:fs/promises';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearReads, readsByPath } from '../../../support/read-counter.js';
import {
  projectId,
  sampleBook,
  stageFiles,
  uploadedAt,
  useStagingFolders,
} from '../../../support/workbook-staging-harness.js';

// RF-152, RF-159, DEC-183, P5-47, P5-50: the file-system port is counted. Every read through
// `node:fs`, `node:fs/promises` and a `FileHandle` is noted with its path and the bytes it returned:
// `read`, `readFile`, `createReadStream`, `readFileSync`. A file that was just written (an upload, a
// rendered file) must not be read again to be hashed: the hash came from the bytes that were written.

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof Fs>();
  const { countStream, noteRead, byteLength } = await import('../../../support/read-counter.js');
  return {
    ...actual,
    createReadStream: (...args: Parameters<typeof actual.createReadStream>) =>
      countStream(actual.createReadStream(...args), args[0]),
    readFileSync: (...args: Parameters<typeof actual.readFileSync>) => {
      // eslint-disable-next-line n/no-sync -- the wrapped call itself.
      const bytes = actual.readFileSync(...args);
      noteRead(args[0], byteLength(bytes));
      return bytes;
    },
  };
});

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  const { countHandle, noteRead, byteLength } = await import('../../../support/read-counter.js');
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) =>
      countHandle(await actual.open(...args), String(args[0])),
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      const bytes = await actual.readFile(...args);
      noteRead(args[0], byteLength(bytes));
      return bytes;
    },
  };
});

const folders = useStagingFolders(afterEach);
beforeEach(() => {
  clearReads();
});

/** The head of a workbook is looked at to tell a package from a compound file (4 bytes). */
const SIGNATURE_BYTES = 4;

describe('the read counter', () => {
  it('P5-50 counts a read through each API it covers', async () => {
    const { dataDir } = await folders();
    const path = join(dataDir, 'probe.bin');
    const content = Buffer.alloc(3000, 7);
    await writeFile(path, content);
    const { createReadStream, readFileSync } = await import('node:fs');
    const { open } = await import('node:fs/promises');

    const chunks: Buffer[] = [];
    for await (const chunk of createReadStream(path)) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).equals(content)).toBe(true);
    expect(readsByPath.get(path)).toBe(content.length);
    clearReads();

    // eslint-disable-next-line n/no-sync -- the counter covers the sync API too.
    readFileSync(path);
    expect(readsByPath.get(path)).toBe(content.length);
    clearReads();

    const handle = await open(path);
    try {
      await handle.readFile();
    } finally {
      await handle.close();
    }
    expect(readsByPath.get(path)).toBe(content.length);
  });
});

describe('workbook batch, files read after they are written', () => {
  it('RF-152 reads no uploaded file and no rendered file again to hash it', async () => {
    const { staging, dataDir } = await folders();
    const { id } = await stageFiles(staging, [
      ['Pricing.xlsx', await sampleBook()],
      ['Rates.xlsx', await sampleBook()],
    ]);
    clearReads();

    const published = await staging.publish(id, {
      projectId,
      uploadedAt,
      signal: new AbortController().signal,
    });

    const inSources = [...readsByPath].filter(([path]) => path.startsWith(dataDir));
    const rendered = inSources.filter(
      ([path]) => path.includes(published.key) || !path.endsWith('.xlsx'),
    );
    expect(rendered).toEqual([]);
    const uploads = inSources.filter(([path]) => path.endsWith('.xlsx'));
    expect(uploads.length).toBeGreaterThan(0);
    for (const [, bytes] of uploads) expect(bytes).toBeLessThanOrEqual(SIGNATURE_BYTES);
  });

  it('RF-152 reads nothing of the tree when a batch of the same content is published again', async () => {
    const { staging, dataDir } = await folders();
    const book = await sampleBook();
    await staging.publish((await stageFiles(staging, [['Pricing.xlsx', book]])).id, {
      projectId,
      uploadedAt,
      signal: new AbortController().signal,
    });
    clearReads();

    await staging.publish((await stageFiles(staging, [['Pricing.xlsx', book]])).id, {
      projectId,
      uploadedAt,
      signal: new AbortController().signal,
    });

    const treeReads = [...readsByPath].filter(
      ([path]) => path.startsWith(dataDir) && path.includes('files'),
    );
    expect(treeReads).toEqual([]);
  });
});

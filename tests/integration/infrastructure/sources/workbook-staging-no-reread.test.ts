import type * as FsPromises from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  projectId,
  sampleBook,
  stageFiles,
  uploadedAt,
  useStagingFolders,
} from '../../../support/workbook-staging-harness.js';

// RF-152, RF-159, DEC-183, P5-47: the file-system port is counted. Every read through
// `node:fs/promises` is noted with its path and the bytes it returned. A file that was just written
// (an upload, a rendered file) must not be read again to be hashed: the hash came from the bytes
// that were written.

const reads = vi.hoisted(() => ({ byPath: new Map<string, number>() }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof FsPromises>();
  const note = (path: unknown, bytes: number): void => {
    const key = String(path);
    reads.byPath.set(key, (reads.byPath.get(key) ?? 0) + bytes);
  };
  return {
    ...actual,
    open: async (...args: Parameters<typeof actual.open>) => {
      const handle = await actual.open(...args);
      const path = args[0];
      return new Proxy(handle, {
        get(target, name) {
          const value: unknown = Reflect.get(target, name, target);
          if (typeof value !== 'function') return value;
          if (name !== 'read') return (value as (...a: unknown[]) => unknown).bind(target);
          return async (...readArgs: unknown[]) => {
            const result = await (
              value as (...a: unknown[]) => Promise<{ bytesRead: number }>
            ).bind(target)(...readArgs);
            note(path, result.bytesRead);
            return result;
          };
        },
      });
    },
    readFile: async (...args: Parameters<typeof actual.readFile>) => {
      const bytes = await actual.readFile(...args);
      note(args[0], bytes.length);
      return bytes;
    },
  };
});

const folders = useStagingFolders(afterEach);
beforeEach(() => {
  reads.byPath.clear();
});

/** The head of a workbook is looked at to tell a package from a compound file (4 bytes). */
const SIGNATURE_BYTES = 4;

describe('workbook batch, files read after they are written', () => {
  it('RF-152 reads no uploaded file and no rendered file again to hash it', async () => {
    const { staging, dataDir } = await folders();
    const { id } = await stageFiles(staging, [
      ['Pricing.xlsx', await sampleBook()],
      ['Rates.xlsx', await sampleBook()],
    ]);
    reads.byPath.clear();

    const published = await staging.publish(id, {
      projectId,
      uploadedAt,
      signal: new AbortController().signal,
    });

    const inSources = [...reads.byPath].filter(([path]) => path.startsWith(dataDir));
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
    reads.byPath.clear();

    await staging.publish((await stageFiles(staging, [['Pricing.xlsx', book]])).id, {
      projectId,
      uploadedAt,
      signal: new AbortController().signal,
    });

    const treeReads = [...reads.byPath].filter(
      ([path]) => path.startsWith(dataDir) && path.includes('files'),
    );
    expect(treeReads).toEqual([]);
  });
});

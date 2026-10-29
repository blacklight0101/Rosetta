import { describe, expect, it } from 'vitest';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  bodyOf,
  requestOf,
  sampleZip,
  sourcesEntries,
  storeIn,
} from '../../../support/upload-store-harness.js';
import { sampleBook } from '../../../support/workbook-staging-harness.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';
import { buildZip } from '../../../support/zip-fixtures.js';

// RF-159, DEC-188: the store tells its caller, before it unpacks, that the zip holds workbooks, so the
// caller can answer at once; a zip without workbooks, or one that cannot be read, does not.

const root = useWritableTempRoot('rosetta-zip-accept-');

async function withBook(name = 'docs/Pricing.xlsx'): Promise<Buffer> {
  return buildZip([
    { name: 'readme.txt', data: Buffer.from('hello') },
    { name, data: await sampleBook() },
  ]);
}

describe('ZipUploadStore tells when the zip holds workbooks', () => {
  it('RF-159 calls onWorkbooks once, before anything is unpacked or stored', async () => {
    const seen: string[][] = [];
    const store = storeIn(root.path);

    await store.store(
      requestOf(bodyOf(await withBook()), {
        onWorkbooks: async () => {
          await Promise.resolve();
          seen.push(await sourcesEntries(root.path));
        },
      }),
    );

    expect(seen).toHaveLength(1);
    expect(seen[0]?.filter((name) => !name.startsWith('.partial-'))).toEqual([]);
  });

  it('RF-159 does not call it for a zip without workbooks', async () => {
    let calls = 0;
    const store = storeIn(root.path);

    await store.store(
      requestOf(bodyOf(await sampleZip()), {
        onWorkbooks: () => {
          calls += 1;
          return Promise.resolve();
        },
      }),
    );

    expect(calls).toBe(0);
  });

  it('RF-159 does not count a workbook under node_modules, which the unpacking leaves out', async () => {
    let calls = 0;
    const store = storeIn(root.path);

    await store.store(
      requestOf(bodyOf(await withBook('node_modules/pkg/Data.xlsx')), {
        onWorkbooks: () => {
          calls += 1;
          return Promise.resolve();
        },
      }),
    );

    expect(calls).toBe(0);
  });
});

describe('ZipUploadStore tells nothing of a zip it cannot take', () => {
  it('RF-128 refuses a zip that cannot be read before calling it, leaving nothing behind', async () => {
    let calls = 0;
    const store = storeIn(root.path);

    const stored = store.store(
      requestOf(bodyOf(Buffer.from('not a zip at all, just text')), {
        onWorkbooks: () => {
          calls += 1;
          return Promise.resolve();
        },
      }),
    );

    await expect(stored).rejects.toBeInstanceOf(RosettaError);
    expect(calls).toBe(0);
    expect(await sourcesEntries(root.path)).toEqual([]);
  });

  it('RF-159 stops with the error the callback throws and leaves nothing behind', async () => {
    const store = storeIn(root.path);

    const stored = store.store(
      requestOf(bodyOf(await withBook()), {
        onWorkbooks: () => Promise.reject(new Error('busy')),
      }),
    );

    await expect(stored).rejects.toThrow('busy');
    expect(await sourcesEntries(root.path)).toEqual([]);
  });
});

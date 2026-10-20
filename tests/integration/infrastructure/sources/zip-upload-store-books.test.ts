import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_WORKBOOK_LIMITS } from '../../../../src/infrastructure/sources/workbook/workbook-limits.js';
import { bodyOf, requestOf, storeIn } from '../../../support/upload-store-harness.js';
import {
  encryptedBook,
  legacyBook,
  sampleBook,
} from '../../../support/workbook-staging-harness.js';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';
import { buildZip, type ZipItem } from '../../../support/zip-fixtures.js';

// RF-152, RF-150, Q-41, DEC-150: a workbook inside an uploaded zip is rendered in place; one that
// cannot be rendered is left out and listed, and the rest of the zip is stored.

const root = useWritableTempRoot('rosetta-zip-books-');

function zipWith(...books: readonly ZipItem[]): Promise<Buffer> {
  return buildZip([{ name: 'src/Orders.cs', data: 'class Orders {}' }, ...books]);
}

async function storedFrom(zip: Buffer, limits = DEFAULT_WORKBOOK_LIMITS) {
  const store = storeIn(root.path, { workbookLimits: limits });
  const stored = await store.store(requestOf(bodyOf(zip)));
  return { stored, tree: await listTree(join(root.path, 'sources', stored.key, 'files')) };
}

describe('ZipUploadStore a zip that holds a workbook', () => {
  it('RF-152 replaces the workbook with its rendered folder, in the same place', async () => {
    const zip = await zipWith({ name: 'docs/Pricing.xlsx', data: await sampleBook() });

    const { tree } = await storedFrom(zip);

    expect(tree).toContain('src/Orders.cs');
    expect(tree).toContain('docs/Pricing.xlsx/workbook.md');
    expect(tree).toContain('docs/Pricing.xlsx/Summary/values.md');
  });

  it('RF-152 keeps a record of the workbook: path, folder, size, hash and counts', async () => {
    const book = await sampleBook();

    const { stored } = await storedFrom(await zipWith({ name: 'docs/Pricing.xlsx', data: book }));

    expect(stored.info.workbooks).toHaveLength(1);
    const [entry] = stored.info.workbooks ?? [];
    expect(entry).toMatchObject({
      fileName: 'docs/Pricing.xlsx',
      folder: 'docs/Pricing.xlsx',
      sizeBytes: book.length,
      counts: { sheets: 1, formulas: 1 },
    });
    expect(entry?.sha256).toMatch(/^sha256:[0-9a-f]{64}$/u);
  });

  it('RF-150 answers a line for the page, and nothing left out', async () => {
    const { stored } = await storedFrom(
      await zipWith({ name: 'Pricing.xlsx', data: await sampleBook() }),
    );

    expect(stored.workbooks).toHaveLength(1);
    expect(stored.workbooks?.[0]).toMatchObject({ name: 'Pricing.xlsx', sheets: 1, formulas: 1 });
    expect(stored.leftOut).toEqual([]);
  });
});

describe('ZipUploadStore the tree of a zip that holds a workbook', () => {
  it('RF-152 leaves the rendered tree read-only and no workbook bytes behind', async () => {
    const { stored } = await storedFrom(
      await zipWith({ name: 'Pricing.xlsx', data: await sampleBook() }),
    );

    const folder = join(root.path, 'sources', stored.key, 'files', 'Pricing.xlsx');
    expect((await stat(folder)).isDirectory()).toBe(true);
    const mode = (await stat(join(folder, 'workbook.md'))).mode;
    expect(mode & 0o222).toBe(0);
    expect(await readFile(join(folder, 'workbook.md'), 'utf8')).toContain('Summary');
  });

  it('RF-130 the same zip stored twice gives the same snapshot', async () => {
    const zip = await zipWith({ name: 'Pricing.xlsx', data: await sampleBook() });

    const first = await storedFrom(zip);
    const second = await storedFrom(zip);

    expect(second.stored.key).toBe(first.stored.key);
  });
});

describe('ZipUploadStore a zip whose workbooks cannot all be rendered', () => {
  it('Q-41 leaves out an encrypted .xlsx and an .xls, lists them and stores the rest', async () => {
    const zip = await zipWith(
      { name: 'Good.xlsx', data: await sampleBook() },
      { name: 'old/Locked.xlsx', data: encryptedBook() },
      { name: 'old/Legacy.xls', data: legacyBook() },
    );

    const { stored, tree } = await storedFrom(zip);

    expect(stored.workbooks?.map((line) => line.name)).toEqual(['Good.xlsx']);
    expect(stored.leftOut?.map((item) => item.name)).toEqual(['old/Legacy.xls', 'old/Locked.xlsx']);
    expect(stored.leftOut?.[0]?.reason).toContain('RST-1921');
    expect(stored.leftOut?.[1]?.reason).toContain('RST-1922');
    expect(tree).toContain('src/Orders.cs');
    expect(tree).toContain('Good.xlsx/workbook.md');
    expect(tree).not.toContain('old/Locked.xlsx');
    expect(tree).not.toContain('old/Legacy.xls');
  });

  it('Q-41 a zip whose only workbook is refused is stored, with nothing rendered', async () => {
    const { stored, tree } = await storedFrom(
      await zipWith({ name: 'Locked.xlsx', data: encryptedBook() }),
    );

    expect(stored.workbooks).toEqual([]);
    expect(stored.leftOut).toHaveLength(1);
    expect(stored.info.workbooks).toBeUndefined();
    expect(tree).toEqual(['src/Orders.cs']);
  });
});

describe('ZipUploadStore a zip whose workbooks break a limit or a format', () => {
  it('RF-151 a workbook that is not a package is left out, not stored as a file', async () => {
    const { stored } = await storedFrom(
      await zipWith({ name: 'Notes.xlsx', data: 'this is not a workbook' }),
    );

    expect(stored.leftOut?.map((item) => item.name)).toEqual(['Notes.xlsx']);
  });

  it('RF-151 the workbooks beyond the count limit are left out and listed', async () => {
    const zip = await zipWith(
      { name: 'A.xlsx', data: await sampleBook() },
      { name: 'B.xlsx', data: await sampleBook() },
    );

    const { stored, tree } = await storedFrom(zip, { ...DEFAULT_WORKBOOK_LIMITS, maxFiles: 1 });

    expect(stored.workbooks?.map((line) => line.name)).toEqual(['A.xlsx']);
    expect(stored.leftOut?.map((item) => item.name)).toEqual(['B.xlsx']);
    expect(tree).not.toContain('B.xlsx');
  });

  it('RF-151 the cells of all the workbooks of a zip count together', async () => {
    const zip = await zipWith(
      { name: 'A.xlsx', data: await sampleBook() },
      { name: 'B.xlsx', data: await sampleBook() },
    );

    const { stored } = await storedFrom(zip, { ...DEFAULT_WORKBOOK_LIMITS, maxCells: 6 });

    expect(stored.workbooks?.map((line) => line.name)).toEqual(['A.xlsx']);
    expect(stored.leftOut?.map((item) => item.name)).toEqual(['B.xlsx']);
  });
});

describe('ZipUploadStore a zip with no workbook', () => {
  it('RF-130 reads as it always did: no workbook fields', async () => {
    const { stored } = await storedFrom(await zipWith());

    expect(stored.workbooks).toBeUndefined();
    expect(stored.leftOut).toBeUndefined();
    expect(stored.info.workbooks).toBeUndefined();
  });
});

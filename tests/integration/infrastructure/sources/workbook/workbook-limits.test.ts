import { expect, it } from 'vitest';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { LimitCounter } from '../../../../../src/infrastructure/sources/entry-guards.js';
import { checkWorkbookBatch } from '../../../../../src/infrastructure/sources/workbook/workbook-batch.js';
import { DEFAULT_WORKBOOK_LIMITS } from '../../../../../src/infrastructure/sources/workbook/workbook-limits.js';
import { buildRawNameZip, patchCentral } from '../../../../support/zip-fixtures.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  emptySheets,
  numberCell,
  readBuilt,
  row,
  sharedCell,
  worksheet,
  type ReadOptions,
} from '../../../../support/workbook-fixtures.js';

const root = useWritableTempRoot('rosetta-workbook-limits-');

async function failureOf(bytes: Buffer, options: ReadOptions = {}): Promise<RosettaError> {
  try {
    await readBuilt(root.path, bytes, options);
  } catch (error) {
    if (error instanceof RosettaError) return error;
    throw error;
  }
  throw new Error('expected the workbook to be refused');
}

/** A sheet of `count` cells in one row-per-cell layout, A1.. in column A. */
function cellsSheet(count: number): string {
  return worksheet(
    Array.from({ length: count }, (_, i) => row(i + 1, numberCell(`A${String(i + 1)}`, i))).join(
      '',
    ),
  );
}

it('RF-151 refuses an XML part above 200 MB once inflated', () => {
  expect(DEFAULT_WORKBOOK_LIMITS.maxPartBytes).toBe(200 * 1024 * 1024);
});

it('RF-151 refuses 201 sheets with RST-1925 before reading any sheet part', async () => {
  const bytes = await buildWorkbook({ sheets: emptySheets(201), omitSheetParts: [1] });

  expect((await failureOf(bytes)).code).toBe('RST-1925');
});

it('RF-151 accepts exactly 200 sheets', async () => {
  const model = await readBuilt(root.path, await buildWorkbook({ sheets: emptySheets(200) }));

  expect(model.sheets).toHaveLength(200);
});

it('RF-151 honours a lower ROSETTA_WORKBOOK_MAX_SHEETS', async () => {
  const bytes = await buildWorkbook({ sheets: emptySheets(3) });

  expect((await failureOf(bytes, { limits: { maxSheets: 2 } })).code).toBe('RST-1925');
});

it('RF-151 accepts a project of exactly the cell limit across two workbooks', async () => {
  const cells = new LimitCounter(10);
  const options = { limits: { maxCells: 10 }, cells };
  const first = await buildWorkbook({ sheets: [{ name: 'A', xml: cellsSheet(6) }] });
  const second = await buildWorkbook({ sheets: [{ name: 'B', xml: cellsSheet(4) }] });

  await readBuilt(root.path, first, options);
  const model = await readBuilt(root.path, second, { ...options, fileName: 'Two.xlsx' });

  expect(model.sheets[0]?.cells).toHaveLength(4);
});

it('RF-151 refuses the cell one over the limit across two workbooks with RST-1926', async () => {
  const cells = new LimitCounter(10);
  const options = { limits: { maxCells: 10 }, cells };
  const first = await buildWorkbook({ sheets: [{ name: 'A', xml: cellsSheet(6) }] });
  const second = await buildWorkbook({ sheets: [{ name: 'B', xml: cellsSheet(5) }] });

  await readBuilt(root.path, first, options);

  expect((await failureOf(second, { ...options, fileName: 'Two.xlsx' })).code).toBe('RST-1926');
});

it('RF-151 does not count an empty styled cell', async () => {
  const empties = worksheet(row(1, '<c r="A1" s="1"/><c r="B1"><v></v></c><c r="C1"/>'));
  const bytes = await buildWorkbook({ sheets: [{ name: 'A', xml: empties }] });

  const model = await readBuilt(root.path, bytes, { limits: { maxCells: 1 } });

  expect(model.sheets[0]?.cells).toEqual([]);
});

it('RF-151 refuses a shared-string table larger than the cell limit with RST-1926', async () => {
  const bytes = await buildWorkbook({
    sheets: [{ name: 'S' }],
    sharedStrings: Array.from({ length: 11 }, (_, i) => `s${String(i)}`),
  });

  expect((await failureOf(bytes, { limits: { maxCells: 10 } })).code).toBe('RST-1926');
});

it('RF-151 accepts a shared-string table of exactly the cell limit', async () => {
  const bytes = await buildWorkbook({
    sheets: [{ name: 'S', xml: worksheet(row(1, sharedCell('A1', 9))) }],
    sharedStrings: Array.from({ length: 10 }, (_, i) => `s${String(i)}`),
  });

  const model = await readBuilt(root.path, bytes, { limits: { maxCells: 10 } });

  expect(model.sharedStringCount).toBe(10);
});

it('RF-151 stops a part that inflates past the limit although the directory understates it', async () => {
  const sheet = cellsSheet(400);
  const zip = await buildWorkbook({ sheets: [{ name: 'S', xml: sheet }] });
  const lying = patchCentral(zip, 'xl/worksheets/sheet1.xml', { uncompressedSize: 100 });

  const failure = await failureOf(lying, { limits: { maxPartBytes: 2000 } });

  expect(failure.code).toBe('RST-1926');
});

it('RF-151 refuses a part whose bytes differ from its directory size with RST-1909', async () => {
  const zip = await buildWorkbook({ sheets: [{ name: 'S', xml: cellsSheet(5) }] });
  const lying = patchCentral(zip, 'xl/worksheets/sheet1.xml', { uncompressedSize: 100 });

  expect((await failureOf(lying)).code).toBe('RST-1909');
});

it('RF-151 stops at the package-wide byte limit of the zip guards with RST-1910', async () => {
  const zip = await buildWorkbook({ sheets: [{ name: 'S', xml: cellsSheet(400) }] });
  const lying = patchCentral(zip, 'xl/worksheets/sheet1.xml', { uncompressedSize: 100 });

  const failure = await failureOf(lying, {
    limits: { zip: { ...DEFAULT_WORKBOOK_LIMITS.zip, maxBytes: 2500 } },
  });

  expect(failure.code).toBe('RST-1910');
});

it('RF-151 refuses a part path that leaves the package with RST-1913', async () => {
  const bytes = await buildRawNameZip([
    { name: '../xl/workbook.xml', data: '<workbook/>' },
    { name: 'xl/workbook.xml', data: '<workbook/>' },
  ]);

  expect((await failureOf(bytes)).code).toBe('RST-1913');
});

it('RF-151 refuses an encrypted entry with RST-1914', async () => {
  const zip = await buildWorkbook({ sheets: [{ name: 'S' }] });
  const encrypted = patchCentral(zip, 'xl/worksheets/sheet1.xml', { flags: 1 });

  expect((await failureOf(encrypted)).code).toBe('RST-1914');
});

it('RF-151 refuses more entries than the limit with RST-1911', async () => {
  const zip = await buildWorkbook({ sheets: [{ name: 'S' }] });

  const failure = await failureOf(zip, {
    limits: { zip: { ...DEFAULT_WORKBOOK_LIMITS.zip, maxEntries: 3 } },
  });

  expect(failure.code).toBe('RST-1911');
});

const MIB = 1024 * 1024;

/** `rows` rows with the same content, or numbered ones: a sheet above 4 MiB once it is inflated. */
function bigSheet(rows: number, identical: boolean): string {
  const body = Array.from({ length: rows }, (_, i) => {
    const n = identical ? 1 : i + 1;
    return `<row r="${String(n)}"><c r="A${String(n)}"><v>${String(n)}</v></c></row>`;
  }).join('');
  return worksheet(body);
}

it('RF-151 refuses a sheet above 4 MiB of identical rows with RST-1912 naming the workbook and the part', async () => {
  const xml = bigSheet(120_000, true);
  expect(Buffer.byteLength(xml)).toBeGreaterThan(4 * MIB);
  const bytes = await buildWorkbook({ sheets: [{ name: 'S', xml }] });

  const failure = await failureOf(bytes, { fileName: 'Prices.xlsx' });

  expect(failure.code).toBe('RST-1912');
  expect(failure.message).toContain('Prices.xlsx');
  expect(failure.message).toContain('xl/worksheets/sheet1.xml');
});

it('RF-151 reads a numbered sheet above 4 MiB, whose rows differ, without tripping the ratio', async () => {
  const xml = bigSheet(150_000, false);
  expect(Buffer.byteLength(xml)).toBeGreaterThan(4 * MIB);
  const bytes = await buildWorkbook({ sheets: [{ name: 'S', xml }] });

  const model = await readBuilt(root.path, bytes);

  expect(model.sheets[0]?.cells).toHaveLength(150_000);
});

it('RF-151 refuses more workbooks than the limit with RST-1924', () => {
  const names = ['a.xlsx', 'b.xlsx', 'c.xlsx'];

  expect(() => {
    checkWorkbookBatch(names, 2);
  }).toThrow(expect.objectContaining({ code: 'RST-1924' }));
});

it('RF-151 accepts exactly the limit', () => {
  expect(() => {
    checkWorkbookBatch(['a.xlsx', 'b.xlsx'], 2);
  }).not.toThrow();
});

it('RF-151 refuses two names that differ only in case with RST-1928', () => {
  expect(() => {
    checkWorkbookBatch(['Prices.xlsx', 'PRICES.XLSX'], 20);
  }).toThrow(expect.objectContaining({ code: 'RST-1928' }));
});

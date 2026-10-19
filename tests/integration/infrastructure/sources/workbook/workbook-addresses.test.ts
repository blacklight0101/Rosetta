import { expect, it } from 'vitest';
import { RosettaError } from '../../../../../src/domain/errors/rosetta-error.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import { buildWorkbook, readBuilt, worksheet } from '../../../../support/workbook-fixtures.js';

const root = useWritableTempRoot('rosetta-workbook-addresses-');

async function refusalOf(rows: string): Promise<RosettaError> {
  const bytes = await buildWorkbook({ sheets: [{ name: 'S', xml: worksheet(rows) }] });
  try {
    await readBuilt(root.path, bytes, { fileName: 'Grid.xlsx' });
  } catch (error) {
    if (error instanceof RosettaError) return error;
    throw error;
  }
  throw new Error('expected the sheet to be refused');
}

async function readRows(rows: string): Promise<readonly string[]> {
  const bytes = await buildWorkbook({ sheets: [{ name: 'S', xml: worksheet(rows) }] });
  const model = await readBuilt(root.path, bytes);
  return model.sheets[0]?.cells.map((cell) => cell.address) ?? [];
}

it('RF-151 refuses a cell address of 220 letters, and the cell after it, without looping', async () => {
  const rows = `<row><c r="${'Z'.repeat(220)}1"><v>1</v></c><c><v>2</v></c></row>`;

  const failure = await refusalOf(rows);

  expect(Buffer.byteLength(worksheet(rows))).toBeLessThan(500);
  expect(failure.code).toBe('RST-1927');
  expect(failure.message).toContain('xl/worksheets/sheet1.xml');
  expect(failure.message).toContain('Grid.xlsx');
});

it('RF-151 reads column XFD, the last one, and refuses XFE', async () => {
  expect(await readRows('<row r="1"><c r="XFD1"><v>1</v></c></row>')).toEqual(['XFD1']);
  const failure = await refusalOf('<row r="1"><c r="XFE1"><v>1</v></c></row>');

  expect(failure.code).toBe('RST-1927');
});

it('RF-151 reads row 1048576, the last one, and refuses 1048577', async () => {
  expect(await readRows('<row r="1048576"><c r="A1048576"><v>1</v></c></row>')).toEqual([
    'A1048576',
  ]);
  expect((await refusalOf('<row r="1048577"/>')).code).toBe('RST-1927');
  expect((await refusalOf('<row r="1"><c r="A1048577"><v>1</v></c></row>')).code).toBe('RST-1927');
});

it('RF-151 refuses a cell without an address that falls after the last column', async () => {
  const cells = '<c r="XFD1"/><c><v>1</v></c>';

  expect((await refusalOf(`<row r="1">${cells}</row>`)).code).toBe('RST-1927');
});

it('RF-151 refuses a row number that is not a whole number or is zero', async () => {
  expect((await refusalOf('<row r="abc"/>')).code).toBe('RST-1927');
  expect((await refusalOf('<row r="0"/>')).code).toBe('RST-1927');
});

it('RF-151 refuses a cell address that is not a column and a row', async () => {
  expect((await refusalOf('<row r="1"><c r="1A"><v>1</v></c></row>')).code).toBe('RST-1927');
  expect((await refusalOf('<row r="1"><c r="A"><v>1</v></c></row>')).code).toBe('RST-1927');
});

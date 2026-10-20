import { expect, it } from 'vitest';
import { renderWorkbook } from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { fileOf } from '../../../../support/rendered-workbook-fixtures.js';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  numberCell,
  readBuilt,
  row,
  worksheet,
} from '../../../../support/workbook-fixtures.js';

// RF-152, RFC-005 section 4.4: hidden rows and hidden columns are read with the sheet, kept as
// compact ranges, and named in the header of `values.md`; their cells are still rendered.

const root = useWritableTempRoot('rosetta-workbook-hidden-');

const hiddenRow = (number: number, cells = ''): string =>
  `<row r="${String(number)}" hidden="1">${cells}</row>`;

/** A sheet XML with `<cols>` in front of the data, where Excel writes it. */
function withColumns(columns: string, rows: string): string {
  return worksheet(rows).replace('<sheetData>', `<cols>${columns}</cols><sheetData>`);
}

async function modelOf(xml: string) {
  const bytes = await buildWorkbook({ sheets: [{ name: 'S', xml }] });
  return readBuilt(root.path, bytes, { fileName: 'Hide.xlsx' });
}

const MIXED = withColumns(
  '<col min="2" max="3" width="9" hidden="1"/><col min="5" max="5" hidden="true"/><col min="7" max="7" width="9"/>',
  [
    row(1, numberCell('A1', 1) + numberCell('B1', 2)),
    hiddenRow(2, numberCell('A2', 3) + numberCell('C2', 4)),
    hiddenRow(3),
    row(4, numberCell('A4', 5)),
    hiddenRow(5, numberCell('E5', 6)),
    hiddenRow(6),
    row(7, numberCell('A7', 7)),
  ].join(''),
);

it('RF-152 reads the hidden rows and the hidden columns of a sheet as ranges', async () => {
  const sheet = (await modelOf(MIXED)).sheets[0];

  expect(sheet?.hiddenRows).toEqual({ ranges: ['2:3', '5:6'], omitted: 0 });
  expect(sheet?.hiddenColumns).toEqual({ ranges: ['B:C', 'E'], omitted: 0 });
});

it('RF-152 a sheet with nothing hidden has no hidden rows or columns', async () => {
  const sheet = (await modelOf(worksheet(row(1, numberCell('A1', 1)), ''))).sheets[0];

  expect(sheet?.hiddenRows).toEqual({ ranges: [], omitted: 0 });
  expect(sheet?.hiddenColumns).toEqual({ ranges: [], omitted: 0 });
});

it('RF-152 a row that omits its number follows the one before, and hidden="0" is not hidden', async () => {
  const rows =
    '<row r="3" hidden="1"><c r="A3"><v>1</v></c></row><row hidden="1"><c><v>2</v></c></row>' +
    '<row hidden="0"><c><v>3</v></c></row>';

  const sheet = (await modelOf(worksheet(rows))).sheets[0];

  expect(sheet?.hiddenRows).toEqual({ ranges: ['3:4'], omitted: 0 });
});

it('RF-152 keeps at most 1,000 hidden ranges and counts the rest', async () => {
  const rows = Array.from({ length: 1500 }, (_, index) => hiddenRow(2 * index + 1)).join('');

  const sheet = (await modelOf(worksheet(rows))).sheets[0];

  expect(sheet?.hiddenRows.ranges).toHaveLength(1000);
  expect(sheet?.hiddenRows.omitted).toBe(500);
});

it('RF-152 names hidden rows and columns in the header of values.md and still renders their cells', async () => {
  const values = fileOf(renderWorkbook(await modelOf(MIXED)), 'S/values.md');

  expect(values).toContain('- Hidden rows: 2:3, 5:6\n');
  expect(values).toContain('- Hidden columns: B:C, E\n');
  expect(values).toContain('R2 | A2 3 | C2 4\n');
  expect(values).toContain('R5 | E5 6\n');
});

import { expect, it } from 'vitest';
import { useWritableTempRoot } from '../../../../support/writable-temp-root.js';
import {
  buildWorkbook,
  formulaCell,
  numberCell,
  readBuilt,
  row,
  sharedCell,
  stylesXml,
  worksheet,
} from '../../../../support/workbook-fixtures.js';

const root = useWritableTempRoot('rosetta-workbook-');

it('RF-151 returns each sheet with its state and the cells that are not empty', async () => {
  const bytes = await buildWorkbook({
    sheets: [
      {
        name: 'Summary',
        xml: worksheet(
          row(1, `${numberCell('A1', 41.5)}${sharedCell('B1', 1)}<c r="C1"/>`) +
            row(2, '<c r="A2" t="b"><v>1</v></c><c r="B2" t="e"><v>#DIV/0!</v></c>') +
            row(
              3,
              '<c r="A3" t="inlineStr"><is><t>inline</t></is></c><c r="B3" t="str"><v>text</v></c>',
            ),
        ),
      },
      { name: 'Hidden', state: 'hidden' },
      { name: 'Deep', state: 'veryHidden' },
    ],
    sharedStrings: ['zero', 'one'],
  });

  const model = await readBuilt(root.path, bytes);

  expect(model.fileName).toBe('Book.xlsx');
  expect(model.sheets.map((sheet) => [sheet.name, sheet.state])).toEqual([
    ['Summary', 'visible'],
    ['Hidden', 'hidden'],
    ['Deep', 'veryHidden'],
  ]);
  expect(model.sheets[0]?.part).toBe('xl/worksheets/sheet1.xml');
  expect(model.sharedStringCount).toBe(2);
  expect(model.sheets[0]?.cells).toEqual([
    { address: 'A1', value: { type: 'number', value: 41.5 } },
    { address: 'B1', value: { type: 'text', value: 'one' } },
    { address: 'A2', value: { type: 'boolean', value: true } },
    { address: 'B2', value: { type: 'error', value: '#DIV/0!' } },
    { address: 'A3', value: { type: 'text', value: 'inline' } },
    { address: 'B3', value: { type: 'text', value: 'text' } },
  ]);
});

it('RF-151 gives a cell the address its position says when the file leaves `r` out', async () => {
  const bytes = await buildWorkbook({
    sheets: [
      {
        name: 'S',
        xml: worksheet('<row r="4"><c><v>1</v></c><c><v>2</v></c></row><row><c><v>3</v></c></row>'),
      },
    ],
  });

  const model = await readBuilt(root.path, bytes);

  expect(model.sheets[0]?.cells.map((cell) => cell.address)).toEqual(['A4', 'B4', 'A5']);
});

it('RF-152 keeps the number format of a cell, built-in or custom, and none for General', async () => {
  const bytes = await buildWorkbook({
    sheets: [
      {
        name: 'S',
        xml: worksheet(
          row(1, `${numberCell('A1', 45000, 1)}${numberCell('A2', 5, 2)}${numberCell('A3', 7, 0)}`),
        ),
      },
    ],
    styles: stylesXml([0, 14, 164], { 164: 'yyyy\\-mm\\-dd' }),
    date1904: true,
  });

  const model = await readBuilt(root.path, bytes);

  expect(model.date1904).toBe(true);
  expect(model.sheets[0]?.cells.map((cell) => cell.numberFormat)).toEqual([
    'mm-dd-yy',
    'yyyy\\-mm\\-dd',
    undefined,
  ]);
});

it('RF-151 keeps the text of a rich shared string and leaves out its phonetic runs', async () => {
  const bytes = await buildWorkbook({
    sheets: [{ name: 'S', xml: worksheet(row(1, sharedCell('A1', 0))) }],
    rawSharedStrings:
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><r><t>Net </t></r><r><t xml:space="preserve">price</t></r><rPh><t>ignored</t></rPh></si></sst>',
  });

  const model = await readBuilt(root.path, bytes);

  expect(model.sheets[0]?.cells[0]?.value).toEqual({ type: 'text', value: 'Net price' });
});

it('RF-151 returns normal, shared and array formulas with their cached values', async () => {
  const bytes = await buildWorkbook({
    sheets: [
      {
        name: 'S',
        xml: worksheet(
          row(1, formulaCell('B1', 'A1*2', '84')) +
            row(
              2,
              '<c r="B2"><f t="shared" ref="B2:B3" si="0">A2+1</f><v>3</v></c>' +
                '<c r="C2"><f t="array" ref="C2:C3">SUM(A1:A2)</f><v>5</v></c>',
            ) +
            row(3, '<c r="B3"><f t="shared" si="0"/><v>4</v></c>' + formulaCell('C3', 'NOW()')),
        ),
      },
    ],
  });

  const cells = (await readBuilt(root.path, bytes)).sheets[0]?.cells;

  expect(cells).toEqual([
    {
      address: 'B1',
      value: { type: 'number', value: 84 },
      formula: { kind: 'normal', text: 'A1*2' },
    },
    {
      address: 'B2',
      value: { type: 'number', value: 3 },
      formula: { kind: 'shared', text: 'A2+1', range: 'B2:B3', sharedIndex: 0 },
    },
    {
      address: 'C2',
      value: { type: 'number', value: 5 },
      formula: { kind: 'array', text: 'SUM(A1:A2)', range: 'C2:C3' },
    },
    {
      address: 'B3',
      value: { type: 'number', value: 4 },
      formula: { kind: 'shared', text: '', sharedIndex: 0 },
    },
    { address: 'C3', formula: { kind: 'normal', text: 'NOW()' } },
  ]);
});

it('RF-151 keeps a formula whose string holds ! and [ as written and reads no reference from it', async () => {
  const text = 'IF(A1=&quot;Other!A1 [Book2.xlsx]Sheet1&quot;,1,0)';
  const bytes = await buildWorkbook({
    sheets: [{ name: 'S', xml: worksheet(row(1, formulaCell('B1', text, '0'))) }],
  });

  const model = await readBuilt(root.path, bytes);

  expect(model.sheets[0]?.cells[0]?.formula?.text).toBe('IF(A1="Other!A1 [Book2.xlsx]Sheet1",1,0)');
  expect(model.externalLinks).toEqual([]);
  expect(model.definedNames).toEqual([]);
});

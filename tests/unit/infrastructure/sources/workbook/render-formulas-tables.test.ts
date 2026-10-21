import { expect, it } from 'vitest';
import {
  renderWorkbook,
  WORKBOOK_RENDERER_VERSION,
} from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { invoiceWorkbook } from '../../../../support/invoice-workbook-fixture.js';
import {
  book,
  cell,
  fileOf,
  linesOf,
  num,
  sheet,
  text,
} from '../../../../support/rendered-workbook-fixtures.js';

// RF-152, P3-94: `formulas.md` names, for a region inside a table, the table and the column it
// fills, so a reader can tie a column letter to its header from the cited lines; a region outside
// every table is named as before. A new renderer version records the change.

const headings = (content: string): string[] =>
  linesOf(content).filter((line) => line.startsWith('## '));

const formula = (value: string) => ({ kind: 'normal', text: value }) as const;

it('RF-152 names the table and the column of each region inside a table', () => {
  const content = fileOf(renderWorkbook(invoiceWorkbook()), 'Invoice/formulas.md');

  expect(headings(content)).toEqual([
    '## Region G8:G12 (5 formulas), InvoiceTable column "Agreed Amount Total"',
    '## Region I8:I12 (5 formulas), InvoiceTable column "Total With Expenses"',
    '## Region L8:L12 (5 formulas), InvoiceTable column "VAT to Pay"',
    '## Region M8:M12 (5 formulas), InvoiceTable column "Final Invoiced Amount"',
    '## Region N8:N12 (5 formulas), InvoiceTable column "Due Date"',
    '## Region O8:O12 (shared formula, 5 cells), InvoiceTable column "Transfer Savings"',
  ]);
});

it('RF-152 names no table for a region of a sheet that has none', () => {
  const rendered = renderWorkbook(invoiceWorkbook());

  for (const name of ['Calculation', 'Template']) {
    const content = fileOf(rendered, `${name}/formulas.md`);
    expect(content).not.toContain(' column "');
    expect(content).not.toContain('InvoiceTable column');
  }
});

it('RF-152 names no table for a region beside the table or below it', () => {
  const rows = [8, 9, 10, 11, 12, 13];
  const model = book([
    sheet('Sales', {
      tables: [{ name: 'SalesTable', range: 'A7:B11', columns: ['Qty', 'Total'] }],
      cells: [
        ...rows.map((row) =>
          cell(`B${String(row)}`, num(row), { formula: formula(`A${String(row)}*2`) }),
        ),
        ...rows.map((row) =>
          cell(`D${String(row)}`, num(row), { formula: formula(`A${String(row)}*3`) }),
        ),
      ],
    }),
  ]);

  const content = fileOf(renderWorkbook(model), 'Sales/formulas.md');

  expect(headings(content)).toEqual([
    '## Region B8:B11 (4 formulas), SalesTable column "Total"',
    '## Region B12:B13 (2 formulas)',
    '## Region D8:D13 (6 formulas)',
  ]);
});

it('RF-152 names a table whose name is not a plain identifier in quotes', () => {
  const model = book([
    sheet('Odd', {
      tables: [{ name: 'My "table"', range: 'A1:A3', columns: ['Total'] }],
      cells: [2, 3].map((row) => cell(`A${String(row)}`, num(row), { formula: formula('1+1') })),
    }),
  ]);

  const content = fileOf(renderWorkbook(model), 'Odd/formulas.md');

  expect(headings(content)).toEqual([
    '## Region A2:A3 (2 formulas), "My \\"table\\"" column "Total"',
  ]);
});

it('RF-152 marks the single formula of a table column in its note', () => {
  const model = book([
    sheet('One', {
      tables: [{ name: 'OneRow', range: 'A1:B2', columns: ['Qty', 'Total'] }],
      cells: [
        cell('A2', num(2)),
        cell('B2', num(4), { formula: formula('OneRow[[#This Row],[Qty]]*2') }),
        cell('D9', num(1), { formula: formula('1+0') }),
      ],
    }),
  ]);

  const content = fileOf(renderWorkbook(model), 'One/formulas.md');

  expect(content).toContain(
    'B2 = OneRow[[#This Row],[Qty]]*2    [table OneRow column "Total"; cached: 4]',
  );
  expect(content).toContain('D9 = 1+0    [cached: 1]');
});

it('RF-152 leaves a header cell and a column the table does not list unnamed', () => {
  const model = book([
    sheet('Edge', {
      tables: [{ name: 'Short', range: 'A1:C3', columns: ['One'] }],
      cells: [
        ...[1, 2, 3].map((row) => cell(`A${String(row)}`, text('x'), { formula: formula('"x"') })),
        ...[2, 3].map((row) => cell(`C${String(row)}`, num(row), { formula: formula('1+1') })),
      ],
    }),
  ]);

  const content = fileOf(renderWorkbook(model), 'Edge/formulas.md');

  expect(headings(content)).toEqual([
    '## Region A2:A3 (2 formulas), Short column "One"',
    '## Region C2:C3 (2 formulas)',
    '## Single cells (1 formula)',
  ]);
});

it('RF-152 is 2 once the regions name their table column', () => {
  expect(WORKBOOK_RENDERER_VERSION).toBe('2');
});

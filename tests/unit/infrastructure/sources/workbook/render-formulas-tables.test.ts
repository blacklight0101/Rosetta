import { expect, it } from 'vitest';
import {
  renderWorkbook,
  WORKBOOK_RENDERER_VERSION,
} from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import {
  rangeColumn,
  tableLocator,
} from '../../../../../src/infrastructure/sources/workbook/formula-tables.js';
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
    'B2 = OneRow[[#This Row],[Qty]]*2    [OneRow column "Total"; cached: 4]',
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

it('RF-152 is 3 once the regions name their table column', () => {
  expect(WORKBOOK_RENDERER_VERSION).toBe('3');
});

const shared = (text: string, range?: string, index = 0) => ({
  kind: 'shared' as const,
  text,
  sharedIndex: index,
  ...(range === undefined ? {} : { range }),
});

it('RF-152 names a shared formula only when its whole range is one column of one table', () => {
  const model = book([
    sheet('Shared', {
      tables: [
        { name: 'Upper', range: 'A1:B4', columns: ['One', 'Two'] },
        { name: 'Lower', range: 'B5:B7', columns: ['Two'] },
      ],
      cells: [
        cell('A2', num(1), { formula: shared('1+1', 'A2:A3') }),
        cell('B2', num(1), { formula: shared('2+2', 'B2:C2', 1) }),
        cell('A4', num(1), { formula: shared('3+3', 'A4:B4', 2) }),
        cell('B3', num(1), { formula: shared('4+4', 'B3:B6', 3) }),
        cell('F2', num(1), { formula: shared('5+5', 'F2:F9', 4) }),
        cell('B7', num(1), { formula: shared('6+6', 'B7:B12', 5) }),
      ],
    }),
  ]);

  const content = fileOf(renderWorkbook(model), 'Shared/formulas.md');

  expect(headings(content)).toEqual([
    '## Region A2:A3 (shared formula, 2 cells), Upper column "One"',
    '## Region B2:C2 (shared formula, 2 cells)',
    '## Region F2:F9 (shared formula, 8 cells)',
    '## Region B3:B6 (shared formula, 4 cells)',
    '## Region A4:B4 (shared formula, 2 cells)',
    '## Region B7:B12 (shared formula, 6 cells)',
  ]);
});

it('RF-152 names no table for a table whose range is not a range', () => {
  const model = book([
    sheet('Bad', {
      tables: [{ name: 'Broken', range: 'not a range', columns: ['Total'] }],
      cells: [2, 3].map((row) => cell(`A${String(row)}`, num(row), { formula: formula('1+1') })),
    }),
  ]);

  const content = fileOf(renderWorkbook(model), 'Bad/formulas.md');

  expect(headings(content)).toEqual(['## Region A2:A3 (2 formulas)']);
});

it('RF-152 quotes and cuts a table name longer than a name may be', () => {
  const name = 'T'.repeat(150);
  const model = book([
    sheet('Long', {
      tables: [{ name, range: 'A1:A3', columns: ['Total'] }],
      cells: [2, 3].map((row) => cell(`A${String(row)}`, num(row), { formula: formula('1+1') })),
    }),
  ]);

  const [region] = headings(fileOf(renderWorkbook(model), 'Long/formulas.md'));

  expect(region).toBe(
    `## Region A2:A3 (2 formulas), "${'T'.repeat(100)}...(+50 characters)" column "Total"`,
  );
});

it('RF-152 finds no column for a range that is not one', () => {
  const locate = tableLocator([{ name: 'Sales', range: 'A1:A5', columns: ['Qty'] }]);

  expect(rangeColumn(locate, 'A2:A3')).toEqual({ table: 'Sales', column: 'Qty' });
  expect(rangeColumn(locate, 'A2:nonsense')).toBeUndefined();
  expect(rangeColumn(locate, 'nonsense:A3')).toBeUndefined();
  expect(rangeColumn(locate, '')).toBeUndefined();
});

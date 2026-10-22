import { expect, it } from 'vitest';
import { workbookFormulasOf } from '../../../../src/domain/planning/workbook-formulas.js';
import { invoiceFormulaFiles } from '../../../support/invoice-formula-files.js';

// RF-152, RF-155, P3-94: the formulas of the rendered workbooks, read by code from `formulas.md`:
// each formula once, the table column it fills, structured references written as column names, up
// to three cached results, and the lines that hold it.

const SHEET = 'Invoice_Sample.xlsm/Invoice';
const rows = () => workbookFormulasOf(invoiceFormulaFiles(), { unread: 0 }).rows;
const rowAt = (id: string) => rows().find((row) => row.id === id);

it('RF-152 lists each formula once, in the order of the files', () => {
  expect(rows().map((row) => [row.id, row.sheet, row.range, row.cells])).toEqual([
    ['F-001', 'Calculation', 'B2:B3', 2],
    ['F-002', 'Calculation', 'C2', 1],
    ['F-003', 'Invoice', 'G8:G12', 5],
    ['F-004', 'Invoice', 'I8:I12', 5],
    ['F-005', 'Invoice', 'L8:L12', 5],
    ['F-006', 'Invoice', 'M8:M12', 5],
    ['F-007', 'Invoice', 'N8:N12', 5],
    ['F-008', 'Invoice', 'O8:O12', 5],
    ['F-009', 'Template', 'D15', 1],
  ]);
});

it('RF-623 names the table column of a region and writes the structured references as column names', () => {
  expect(rowAt('F-003')).toEqual({
    ...{ id: 'F-003', workbook: 'Invoice_Sample.xlsm', sheet: 'Invoice', folder: SHEET },
    ...{ shape: 'region', range: 'G8:G12', cells: 5 },
    ...{ table: 'InvoiceTable', column: 'Agreed Amount Total' },
    formula: '[Amount Line 1]+[Amount Line 2]+[Amount Line 3]',
    cached: [
      { address: 'G8', kind: 'plain', text: '175' },
      { address: 'G9', kind: 'plain', text: '186' },
      { address: 'G10', kind: 'plain', text: '197' },
    ],
    source: { path: `${SHEET}/formulas.md`, startLine: 4, endLine: 7 },
  });
});

it('RF-623 gives the other four formulas of the table with their columns', () => {
  const formulas = ['F-004', 'F-005', 'F-006', 'F-007'].map((id) => {
    const row = rowAt(id);
    return [row?.column, row?.formula];
  });

  expect(formulas).toEqual([
    ['Total With Expenses', '[Agreed Amount Total]+[Additional Expenses]'],
    ['VAT to Pay', '[Net Amount]*[VAT Rate]'],
    ['Final Invoiced Amount', '[Net Amount]+[VAT to Pay]'],
    ['Due Date', 'IF([Invoice Date]="","",WORKDAY([Invoice Date],14))'],
  ]);
});

it('RF-152 keeps a date as the date it is', () => {
  expect(rowAt('F-007')?.cached[0]).toEqual({ address: 'N8', kind: 'plain', text: '2026-03-19' });
});

it('RF-152 reads a shared formula as one row, with the cached result of its first cell', () => {
  expect(rowAt('F-008')).toMatchObject({
    shape: 'shared',
    range: 'O8:O12',
    cells: 5,
    table: 'InvoiceTable',
    column: 'Transfer Savings',
    formula: 'G8*0.5',
    cached: [{ address: 'O8', kind: 'plain', text: '87.5' }],
    source: { startLine: 29, endLine: 30 },
  });
});

it('RF-153 keeps the whole-column references of a SUMIFS and names no table column', () => {
  const row = rowAt('F-001');

  expect(row?.formula).toBe(
    'SUMIFS(InvoiceTable[Final Invoiced Amount],InvoiceTable[Customer],A2)',
  );
  expect(row).not.toHaveProperty('table');
  expect(row).not.toHaveProperty('column');
  expect(row?.cached.map((value) => value.text)).toEqual(['541.25', '593.75']);
});

it('RF-152 reads a single formula of a template sheet with its cached result', () => {
  expect(rowAt('F-009')).toMatchObject({
    shape: 'single',
    formula: 'SUM(D5:D14)',
    cached: [{ address: 'D15', kind: 'plain', text: '0' }],
    source: { path: 'Invoice_Sample.xlsm/Template/formulas.md', startLine: 5, endLine: 5 },
  });
});

it('RF-152 reads a cached text as text, to be masked', () => {
  const [value] = rowAt('F-002')?.cached ?? [];

  expect(value).toMatchObject({ address: 'C2', kind: 'text' });
  expect(value?.text.startsWith('Contact key ')).toBe(true);
});

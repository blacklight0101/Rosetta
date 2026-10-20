import { expect, it } from 'vitest';
import {
  renderWorkbook,
  WORKBOOK_RENDERER_VERSION,
} from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import { book, cell, fileOf, num, sheet } from '../../../../support/rendered-workbook-fixtures.js';

const model = book(
  [
    sheet('Summary', {
      usedRange: 'A1:D3',
      cells: [cell('A1', num(1)), cell('B1', num(2), { formula: { kind: 'normal', text: 'A1' } })],
      comments: [{ address: 'A1', text: 'x' }],
      mergedRanges: ['A1:B1'],
      tables: [{ name: 'Prices', range: 'B2:D9', columns: ['Item', 'Price'] }],
      pivots: [{ name: 'PivotTable1', range: 'A3:C20' }],
      charts: ['barChart'],
    }),
    sheet('Rates 2026', { state: 'hidden' }),
    sheet('Deep', { state: 'veryHidden' }),
  ],
  {
    fileName: 'Pricing.xlsx',
    definedNames: [
      { name: 'TaxRate', hidden: false, refersTo: "'Rates 2026'!$C$4" },
      { name: 'Local', sheet: 'Summary', hidden: true, refersTo: 'Summary!$A$1' },
    ],
    externalLinks: [{ fileName: 'C:\\Users\\x\\Rates.xlsx' }],
    connections: [{ name: 'Sales cube', sourceType: 1 }, { name: 'Other' }],
    hasMacros: true,
  },
);

it('RF-152 starts with the table that maps every safe name to the real one', () => {
  const workbook = fileOf(renderWorkbook(model), 'workbook.md');

  expect(workbook).toContain('# Workbook "Pricing.xlsx"\n');
  expect(workbook).toContain(`- Renderer version: ${WORKBOOK_RENDERER_VERSION}\n`);
  expect(workbook).toContain(
    [
      '| Segment | Kind | Real name |',
      '|---|---|---|',
      '| Pricing.xlsx | workbook | "Pricing.xlsx" |',
      '| Summary | sheet | "Summary" |',
      '| Rates_2026 | sheet | "Rates 2026" |',
      '| Deep | sheet | "Deep" |',
    ].join('\n'),
  );
  expect(workbook.indexOf('| Segment | Kind | Real name |')).toBeLessThan(
    workbook.indexOf('| Segment | State |'),
  );
});

it('RF-152 lists sheets with visibility, used range and counts', () => {
  const workbook = fileOf(renderWorkbook(model), 'workbook.md');

  expect(workbook).toContain(
    [
      '| Segment | State | Used range | Cells | Formulas | Comments | Merged ranges |',
      '|---|---|---|---|---|---|---|',
      '| Summary | visible | "A1:D3" | 2 | 1 | 1 | 1 |',
      '| Rates_2026 | hidden | - | 0 | 0 | 0 | 0 |',
      '| Deep | veryHidden | - | 0 | 0 | 0 | 0 |',
    ].join('\n'),
  );
});

it('RF-152 lists names, tables, links, connections, pivots and charts', () => {
  const workbook = fileOf(renderWorkbook(model), 'workbook.md');

  expect(workbook).toContain('| "TaxRate" | workbook | no | "\'Rates 2026\'!$C$4" |');
  expect(workbook).toContain('| "Local" | Summary | yes | "Summary!$A$1" |');
  expect(workbook).toContain('| Summary | "Prices" | "B2:D9" | "Item", "Price" |');
  expect(workbook).toContain('- "Rates.xlsx"');
  expect(workbook).not.toContain('Users');
  expect(workbook).toContain('| "Sales cube" | 1 |');
  expect(workbook).toContain('| "Other" | - |');
  expect(workbook).toContain('| Summary | "PivotTable1" | "A3:C20" |');
  expect(workbook).toContain('| Summary | "barChart" |');
});

it('RF-152 says macros are not read yet when the workbook holds a VBA project', () => {
  const workbook = fileOf(renderWorkbook(model), 'workbook.md');
  expect(workbook).toContain('not read yet');
  const plain = fileOf(renderWorkbook(book([sheet('S')])), 'workbook.md');
  expect(plain).toContain('- No VBA project.');
});

it('RF-152 writes the sheet count, the cell count and the formula count of the result', () => {
  const rendered = renderWorkbook(model);
  expect(rendered.counts).toEqual({ sheets: 3, nonEmptyCells: 2, formulas: 1 });
});

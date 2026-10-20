import { expect, it } from 'vitest';
import { renderWorkbook } from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import {
  book,
  cell,
  fileOf,
  num,
  sheet,
  text,
} from '../../../../support/rendered-workbook-fixtures.js';

const DATE_SERIAL = 46082; // 2026-03-01

it('RF-152 writes one line per row, each starting with its row and carrying every cell address', () => {
  const formula = (value: string) => ({ kind: 'normal', text: value }) as const;
  const model = book([
    sheet('Summary', {
      usedRange: 'A1:D3',
      cells: [
        cell('D3', { type: 'error', value: '#N/A' }, { formula: formula('NA()') }),
        cell('B3', { type: 'boolean', value: true }),
        cell('A1', text('Region')),
        cell('C3', num(DATE_SERIAL), { numberFormat: 'yyyy-mm-dd' }),
        cell('D2', num(5000), { formula: formula('B2*C2') }),
        cell('B1', text('Units')),
        cell('C1', text('Price')),
        cell('D1', text('Total')),
        cell('A2', text('North')),
        cell('B2', num(4)),
        cell('C2', num(1250)),
        cell('A3', text('South')),
      ],
    }),
  ]);

  const values = fileOf(renderWorkbook(model), 'Summary/values.md');

  expect(values).toBe(
    [
      '# Values of sheet "Summary"',
      '- State: visible',
      '- Used range: A1:D3',
      '- Non-empty cells: 12',
      '',
      'R1 | A1 "Region" | B1 "Units" | C1 "Price" | D1 "Total"',
      'R2 | A2 "North" | B2 4 | C2 1250 | D2 5000 (f)',
      'R3 | A3 "South" | B3 TRUE | C3 2026-03-01 | D3 #N/A (f)',
      '',
    ].join('\n'),
  );
});

it('RF-152 lists merged ranges and the state in the header', () => {
  const model = book([
    sheet('Hidden one', {
      state: 'hidden',
      mergedRanges: ['A1:B1', 'C5:D6'],
      cells: [cell('A1', num(1))],
    }),
    sheet('Deep', { state: 'veryHidden', cells: [cell('A1', num(1))] }),
  ]);

  const rendered = renderWorkbook(model);

  expect(fileOf(rendered, 'Hidden_one/values.md')).toContain(
    '- State: hidden\n- Used range: (none)\n- Merged ranges: A1:B1, C5:D6\n',
  );
  expect(fileOf(rendered, 'Deep/values.md')).toContain('- State: veryHidden\n');
});

it('RF-152 writes an empty sheet with all four files and a plain line saying so', () => {
  const rendered = renderWorkbook(book([sheet('Empty')]));

  expect(fileOf(rendered, 'Empty/values.md')).toContain('\nNo values.\n');
  expect(fileOf(rendered, 'Empty/formulas.md')).toContain('\nNo formulas.\n');
  expect(fileOf(rendered, 'Empty/validation.md')).toContain('None.');
  expect(fileOf(rendered, 'Empty/notes.md')).toContain('\nNo comments.\n');
});

it('RF-152 groups formulas in regions, writes a shared formula once for its range and marks arrays', () => {
  const normal = (formula: string) => ({ kind: 'normal', text: formula }) as const;
  const model = book([
    sheet('Summary', {
      cells: [
        cell('B13', num(1200), { formula: normal('IF(C13>1000, C13*0.95, C13)') }),
        cell('B12', num(950), { formula: normal('IF(C12>1000, C12*0.95, C12)') }),
        cell('H1', num(2150), { formula: normal('SUM(B12:B13)') }),
        cell('D2', num(110.5), {
          formula: {
            kind: 'shared',
            text: "B2*'Rates 2026'!$C$4",
            range: 'D2:D4001',
            sharedIndex: 0,
          },
        }),
        cell('D3', num(120), { formula: { kind: 'shared', text: '', sharedIndex: 0 } }),
        cell('F2', num(7), {
          formula: { kind: 'array', text: "TRANSPOSE('Rates 2026'!A2:H2)", range: 'F2:F9' },
        }),
      ],
    }),
  ]);

  const formulas = fileOf(renderWorkbook(model), 'Summary/formulas.md');

  expect(formulas).toBe(
    [
      '# Formulas of sheet "Summary"',
      '- Formula cells: 6',
      '',
      '## Region B12:B13 (2 formulas)',
      'B12 = IF(C12>1000, C12*0.95, C12)    [cached: 950]',
      'B13 = IF(C13>1000, C13*0.95, C13)    [cached: 1200]',
      '',
      '## Single cells (1 formula)',
      'H1 = SUM(B12:B13)    [cached: 2150]',
      '',
      '## Region D2:D4001 (shared formula, 4000 cells)',
      "D2:D4001 = B2*'Rates 2026'!$C$4    [written for D2; cached D2: 110.5]",
      '',
      '## Array formulas',
      "F2:F9 {= TRANSPOSE('Rates 2026'!A2:H2)}    [array; cached F2: 7]",
      '',
    ].join('\n'),
  );
});

it('RF-152 says when a formula has no cached value and keeps a shared formula whose first cell is missing', () => {
  const model = book([
    sheet('S', {
      cells: [
        cell('A1', undefined, { formula: { kind: 'normal', text: 'B1' } }),
        cell('A5', num(3), { formula: { kind: 'shared', text: '', sharedIndex: 9 } }),
      ],
    }),
  ]);

  const formulas = fileOf(renderWorkbook(model), 'S/formulas.md');

  expect(formulas).toContain('A1 = B1    [no cached value]');
  expect(formulas).toContain('A5 = (shared formula 9, its text is not in the file)    [cached: 3]');
});

it('RF-152 keeps a formula on one line even when it holds a line break', () => {
  const model = book([
    sheet('S', {
      cells: [cell('A1', num(1), { formula: { kind: 'normal', text: 'IF(B1,\n"B2 = x",0)' } })],
    }),
  ]);

  const formulas = fileOf(renderWorkbook(model), 'S/formulas.md');

  expect(formulas).toContain('A1 = IF(B1,\\n"B2 = x",0)    [cached: 1]');
});

it('RF-152 lists validation and conditional rules with their ranges', () => {
  const model = book([
    sheet('Summary', {
      validations: [
        { ranges: 'B2:B50', type: 'whole', operator: 'between', formula1: '1', formula2: '10' },
        { ranges: 'A2:A9', type: 'list', formula1: '"Yes,No"' },
      ],
      conditionalRules: [
        { ranges: 'C2:C40', type: 'cellIs', operator: 'greaterThan', formulas: ['1000'] },
        { ranges: 'A1:A9', type: 'expression', formulas: ['MOD(ROW(),2)=0'] },
      ],
    }),
  ]);

  const validation = fileOf(renderWorkbook(model), 'Summary/validation.md');

  expect(validation).toBe(
    [
      '# Validation of sheet "Summary"',
      '- Data validation rules: 2',
      '- Conditional formatting rules: 2',
      '',
      '## Data validation',
      'B2:B50 validation whole between: 1 and 10',
      'A2:A9 validation list: "Yes,No"',
      '',
      '## Conditional formatting',
      'C2:C40 conditional cellIs greaterThan: 1000',
      'A1:A9 conditional expression: MOD(ROW(),2)=0',
      '',
    ].join('\n'),
  );
});

it('RF-152 lists comments with their cell address and no author', () => {
  const model = book([
    sheet('Summary', {
      comments: [
        { address: 'B5', text: 'Check with finance\nbefore sending' },
        { address: 'A1', text: 'Header' },
      ],
    }),
  ]);

  const notes = fileOf(renderWorkbook(model), 'Summary/notes.md');

  expect(notes).toBe(
    [
      '# Notes of sheet "Summary"',
      '- Comments: 2',
      '',
      'A1 "Header"',
      'B5 "Check with finance\\nbefore sending"',
      '',
    ].join('\n'),
  );
});

import { describe, expect, it } from 'vitest';
import { workbookCellLabel } from '../../../../src/domain/sources/workbook-cell-label.js';

// RF-156, RFC-005 section 4.4: a citation to a rendered file shows the workbook, the sheet and the
// cells that the cited lines carry. The cells are read from the start of each line, so a value, a
// formula or a note that merely quotes an address says nothing about the cells.

const formulas = [
  '## Region B2:B40 (39 formulas)',
  'B12 = IF(C12>1000, C12*0.95, C12)    [cached: 950]',
  'B13 = IF(C13>1000, C13*0.95, C13)    [cached: 1200]',
  '## Region D2:D4001 (shared formula, 4000 cells)',
  "D2:D4001 = B2*'Rates 2026'!$C$4    [written for D2; cached D2: 110.5]",
  '## Array formulas',
  "F2:F9 {= TRANSPOSE('Rates 2026'!A2:H2)}    [array]",
];

describe('workbookCellLabel', () => {
  it('RF-156 names the workbook, the sheet and the cells of formula lines', () => {
    expect(workbookCellLabel('Pricing.xlsx/Summary/formulas.md', formulas.slice(1, 3))).toBe(
      'Pricing.xlsx, sheet Summary, cells B12, B13',
    );
  });

  it('RF-156 keeps a range and an array formula as the range', () => {
    expect(workbookCellLabel('Pricing.xlsx/Summary/formulas.md', formulas.slice(4, 7))).toBe(
      'Pricing.xlsx, sheet Summary, cells D2:D4001, F2:F9',
    );
  });

  it('RF-156 reads a citation across a region heading from the lines that carry cells', () => {
    expect(workbookCellLabel('Pricing.xlsx/Summary/formulas.md', formulas.slice(0, 4))).toBe(
      'Pricing.xlsx, sheet Summary, cells B12, B13',
    );
  });

  it('RF-156 names the workbook and the sheet only when the lines carry no cell', () => {
    expect(workbookCellLabel('Pricing.xlsx/Summary/formulas.md', [formulas[0] ?? ''])).toBe(
      'Pricing.xlsx, sheet Summary',
    );
    expect(workbookCellLabel('Pricing.xlsx/Summary/formulas.md', [])).toBe(
      'Pricing.xlsx, sheet Summary',
    );
  });

  it('RF-156 reads every cell of a values line and skips the row marker', () => {
    const lines = [
      'R1 | A1 "Region" | B1 "Units" | C1 "Price" | D1 "Total"',
      'R2 | A2 "North" | B2 4 | C2 1250 | D2 5000 (f)',
    ];

    expect(workbookCellLabel('Pricing.xlsx/Summary/values.md', lines)).toBe(
      'Pricing.xlsx, sheet Summary, cells A1, B1, C1, D1, A2, B2 and 2 more',
    );
    expect(workbookCellLabel('Pricing.xlsx/Summary/values.md', [lines[1] ?? ''])).toBe(
      'Pricing.xlsx, sheet Summary, cells A2, B2, C2, D2',
    );
  });
});

describe('workbookCellLabel, quoted text and other files', () => {
  it('RF-156 does not take a cell address inside a quoted text for a cell', () => {
    const line = 'R7 | A7 "x | Z9 \\"y\\" | Q1 1" | B7 3';

    expect(workbookCellLabel('Pricing.xlsx/Summary/values.md', [line])).toBe(
      'Pricing.xlsx, sheet Summary, cells A7, B7',
    );
  });

  it('RF-156 reads the validation and the notes files by the start of the line', () => {
    expect(workbookCellLabel('Pricing.xlsx/Rates_2026/validation.md', ['C2:C40 list "a,b"'])).toBe(
      'Pricing.xlsx, sheet Rates_2026, cells C2:C40',
    );
    expect(workbookCellLabel('Pricing.xlsx/Rates_2026/notes.md', ['D4 "check this"'])).toBe(
      'Pricing.xlsx, sheet Rates_2026, cells D4',
    );
  });

  it('RF-156 works for a workbook inside a folder of a zip', () => {
    expect(
      workbookCellLabel('finance/2026/Budget.xlsm/Plan/formulas.md', ['A1 = B1+1    [cached: 2]']),
    ).toBe('Budget.xlsm, sheet Plan, cells A1');
  });

  it('RF-156 shows no label for dependencies.md, workbook.md or a macro file', () => {
    const lines = ['A1 = B1'];

    expect(workbookCellLabel('dependencies.md', lines)).toBeUndefined();
    expect(workbookCellLabel('Pricing.xlsx/workbook.md', lines)).toBeUndefined();
    expect(workbookCellLabel('Pricing.xlsx/macros/Module1.bas', lines)).toBeUndefined();
    expect(workbookCellLabel('Pricing.xlsx/macros/ThisWorkbook.cls', lines)).toBeUndefined();
  });

  it('RF-156 shows no label for a file that is not inside a workbook folder', () => {
    expect(workbookCellLabel('src/formulas.md', ['A1 = 2'])).toBeUndefined();
    expect(workbookCellLabel('docs/values.md', ['R1 | A1 1'])).toBeUndefined();
    expect(workbookCellLabel('Pricing.xlsx/formulas.md', ['A1 = 2'])).toBeUndefined();
    expect(workbookCellLabel('Pricing.xls/Summary/formulas.md', ['A1 = 2'])).toBeUndefined();
  });
});

it('RF-156 reads every range of a validation or conditional rule line, up to 40', () => {
  const lines = [
    'A1:A5 C1 E2:F3 validation list: "Yes,No"',
    'B1:B5 conditional expression: A1>1',
    'D4 D5 validation (continued): 1 and 2',
  ];

  expect(workbookCellLabel('Pricing.xlsx/Summary/validation.md', lines)).toBe(
    'Pricing.xlsx, sheet Summary, cells A1:A5, C1, E2:F3, B1:B5, D4, D5',
  );
  const many = Array.from({ length: 40 }, (_, i) => `A${String(i + 1)}`).join(' ');
  const label = workbookCellLabel('Pricing.xlsx/S/validation.md', [`${many} validation x: 1`]);
  expect(label).toBe('Pricing.xlsx, sheet S, cells A1, A2, A3, A4, A5, A6 and 34 more');
});

it('RF-156 reads a range list only when a rule word follows it', () => {
  expect(workbookCellLabel('Pricing.xlsx/S/validation.md', ['A1 B2 and then text'])).toBe(
    'Pricing.xlsx, sheet S, cells A1',
  );
});

it('RF-156 reads no more than 40 ranges of a rule line', () => {
  const many = Array.from({ length: 60 }, (_, i) => `A${String(i + 1)}`).join(' ');
  const label = workbookCellLabel('Pricing.xlsx/S/validation.md', [`${many} validation x: 1`]);
  expect(label).toBe('Pricing.xlsx, sheet S, cells A1');
});

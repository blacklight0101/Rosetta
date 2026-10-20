import { expect, it } from 'vitest';
import {
  book,
  cell,
  fileOf,
  num,
  sheet,
  text,
} from '../../../../support/rendered-workbook-fixtures.js';
import type { WorkbookCell } from '../../../../../src/infrastructure/sources/workbook/workbook-model.js';
import {
  dependenciesOf,
  pricingProject,
  projectOf,
  sectionOf,
  withFormula,
} from '../../../../support/dependency-fixtures.js';

const UNRESOLVED = 'Unresolved and dynamic references';

const content = dependenciesOf(pricingProject());

it('RF-153 lists the workbook-to-workbook edges with the number of formulas', () => {
  expect(sectionOf(content, 'Workbooks')).toEqual(['Pricing.xlsx -> Rates.xlsx: 1 formula']);
});

it('RF-153 lists the sheet-to-sheet edges, inside and across workbooks, with formula counts', () => {
  expect(sectionOf(content, 'Sheets')).toEqual([
    'Pricing.xlsx/Summary -> Pricing.xlsx/Rates_2026: 3 formulas',
    'Pricing.xlsx/Summary -> Rates.xlsx/Rates: 1 formula',
  ]);
});

it('RF-153 lists input cells (no formula, read by a formula) grouped into ranges per sheet', () => {
  expect(sectionOf(content, 'Input cells')).toEqual([
    'Pricing.xlsx/Summary!B2:C3',
    'Pricing.xlsx/Rates_2026!C4',
    'Rates.xlsx/Rates!C4',
  ]);
});

it('RF-153 lists output cells (a formula nothing reads) grouped into ranges per sheet', () => {
  expect(sectionOf(content, 'Output cells')).toEqual([
    'Pricing.xlsx/Summary!E2:G2',
    'Pricing.xlsx/Summary!H2:H3',
    'Pricing.xlsx/Summary!I2',
  ]);
});

it('RF-153 lists a defined name with its target and the sheets that use it', () => {
  expect(sectionOf(content, 'Defined names')).toEqual([
    'Pricing.xlsx/Rates_2026!C4 name "TaxRate" refers to "\'Rates 2026\'!$C$4"',
    'Pricing.xlsx/Rates_2026!C4 name "TaxRate" used by Pricing.xlsx/Summary (1 formula)',
  ]);
});

it('RF-153 lists an external reference to a workbook that is not uploaded by file name only (Q-38)', () => {
  expect(sectionOf(content, UNRESOLVED)).toContain(
    'Pricing.xlsx/Summary!G2 reads the workbook "Missing.xlsx", which is not uploaded',
  );
  expect(content).not.toContain('Users');
});

it('RF-153 lists INDIRECT and OFFSET cells as dynamic references, not guessed', () => {
  const lines = sectionOf(content, UNRESOLVED);
  expect(lines).toContain('Pricing.xlsx/Summary!H2 INDIRECT is a dynamic reference');
  expect(lines).toContain('Pricing.xlsx/Summary!H3 OFFSET is a dynamic reference');
});

it('RF-153 says when the project has no circular reference', () => {
  expect(sectionOf(content, 'Circular references')).toEqual(['None.']);
});

it('RF-153 writes the same bytes twice and for cells given in another order', () => {
  const reversed = pricingProject().map((model) => ({
    ...model,
    sheets: model.sheets.map((s) => ({ ...s, cells: [...s.cells].reverse() })),
  }));
  expect(dependenciesOf(reversed)).toBe(content);
  expect(dependenciesOf(pricingProject())).toBe(content);
});

it('RF-153 keeps dependencies.md at the root, beside the workbook folders', () => {
  const project = projectOf(pricingProject());
  expect(project.dependencies.path).toBe('dependencies.md');
  expect(project.workbooks.map((w) => w.folder)).toEqual(['Pricing.xlsx', 'Rates.xlsx']);
  for (const workbook of project.workbooks) {
    expect(workbook.files.map((f) => f.path)).not.toContain('dependencies.md');
  }
});

it('RF-153 reads a three-dimensional range as an edge to each sheet it spans', () => {
  const sheets = ['S1', 'S2', 'S3'].map((name) => sheet(name, { cells: [cell('B2', num(1))] }));
  const total = sheet('Total', { cells: [withFormula('A1', 'SUM(S1:S3!B2)')] });
  const content = dependenciesOf([book([...sheets, total], { fileName: 'Book.xlsx' })]);

  expect(sectionOf(content, 'Sheets')).toEqual([
    'Book.xlsx/Total -> Book.xlsx/S1: 1 formula',
    'Book.xlsx/Total -> Book.xlsx/S2: 1 formula',
    'Book.xlsx/Total -> Book.xlsx/S3: 1 formula',
  ]);
  expect(sectionOf(content, 'Input cells')).toEqual([
    'Book.xlsx/S1!B2',
    'Book.xlsx/S2!B2',
    'Book.xlsx/S3!B2',
  ]);
});

it('RF-153 reads whole columns and whole rows as the cells that exist in them', () => {
  const data = sheet('Data', {
    cells: [cell('A1', num(1)), cell('A2', num(2)), cell('B1', num(3)), cell('C9', num(4))],
  });
  const calc = sheet('Calc', {
    cells: [withFormula('A1', 'SUM(Data!A:A)'), withFormula('A2', 'SUM(Data!1:1)')],
  });
  const content = dependenciesOf([book([data, calc], { fileName: 'Book.xlsx' })]);

  expect(sectionOf(content, 'Input cells')).toEqual(['Book.xlsx/Data!A1:B1', 'Book.xlsx/Data!A2']);
});

it('RF-153 reads a structured table reference as the table columns it names', () => {
  const data = sheet('Data', {
    tables: [{ name: 'Sales', range: 'A1:D4', columns: ['Region', 'Qty', 'Price', 'Total'] }],
    cells: ['A', 'B', 'C'].flatMap((col) =>
      [2, 3, 4].map((row) => cell(`${col}${String(row)}`, num(row))),
    ),
  });
  const calc = sheet('Calc', {
    cells: [withFormula('A1', 'SUM(Sales[Price])'), withFormula('A2', 'Sales[[#This Row],[Qty]]')],
  });
  const content = dependenciesOf([book([data, calc], { fileName: 'Book.xlsx' })]);

  expect(sectionOf(content, 'Input cells')).toEqual(['Book.xlsx/Data!B2:C4']);
});

it('RF-153 reads a shared formula for every cell it covers, shifted from its first cell', () => {
  const shared = (text: string): Partial<WorkbookCell> => ({
    formula: { kind: 'shared', text, range: 'D2:D4', sharedIndex: 0 },
  });
  const cells = [
    cell('B2', num(1)),
    cell('B3', num(2)),
    cell('B4', num(3)),
    cell('D2', num(0), shared('B2*2')),
    cell('D3', num(0), shared('')),
    cell('D4', num(0), shared('')),
  ];
  const content = dependenciesOf([book([sheet('S', { cells })], { fileName: 'Book.xlsx' })]);

  expect(sectionOf(content, 'Input cells')).toEqual(['Book.xlsx/S!B2:B4']);
  expect(sectionOf(content, 'Output cells')).toEqual(['Book.xlsx/S!D2:D4']);
});

it('RF-153 lists a reference to a sheet that the workbook does not have', () => {
  const content = dependenciesOf([
    book([sheet('S', { cells: [withFormula('B1', 'Gone!A1+1')] })], { fileName: 'Book.xlsx' }),
  ]);
  expect(sectionOf(content, UNRESOLVED)).toEqual([
    'Book.xlsx/S!B1 reads the sheet "Gone", which the workbook does not have',
  ]);
});

it('RF-153 does not mistake a string, a function or a name that is not defined for a reference', () => {
  const cells = [
    cell('A1', text('x')),
    withFormula('B1', 'IF(1>0,"A1",LOG10(100))'),
    withFormula('B2', 'Undefined+TRUE'),
  ];
  const content = dependenciesOf([book([sheet('S', { cells })], { fileName: 'Book.xlsx' })]);
  expect(sectionOf(content, 'Input cells')).toEqual(['None.']);
  expect(sectionOf(content, 'Defined names')).toEqual(['None.']);
});

it('RF-153 sees a name that looks like a cell as the name when the file defines it', () => {
  const rates = sheet('Rates', { cells: [cell('B7', num(0.2))] });
  const calc = sheet('Calc', { cells: [withFormula('A1', 'TAX1*2')] });
  const content = dependenciesOf([
    book([rates, calc], {
      fileName: 'Book.xlsx',
      definedNames: [{ name: 'TAX1', hidden: false, refersTo: 'Rates!$B$7' }],
    }),
  ]);
  expect(sectionOf(content, 'Input cells')).toEqual(['Book.xlsx/Rates!B7']);
});

it('RF-153 resolves an external file name without its case, and a link that names a folder', () => {
  const reader = book([sheet('S', { cells: [withFormula('A1', '[1]Rates!C4')] })], {
    fileName: 'Reader.xlsx',
    externalLinks: [{ fileName: 'C:\\Users\\x\\RATES.XLSX' }],
  });
  const rates = book([sheet('Rates', { cells: [cell('C4', num(1))] })], {
    fileName: 'Rates.xlsx',
  });
  const content = dependenciesOf([reader, rates]);
  expect(sectionOf(content, 'Workbooks')).toEqual(['Reader.xlsx -> Rates.xlsx: 1 formula']);
  expect(content).not.toContain('Users');
});

it('RF-153 lists a circular reference between two cells', () => {
  const cells = [withFormula('A1', 'B1+1'), withFormula('B1', 'A1+1'), withFormula('C1', 'A1')];
  const content = dependenciesOf([book([sheet('Loop', { cells })], { fileName: 'Book.xlsx' })]);
  expect(sectionOf(content, 'Circular references')).toEqual([
    'Book.xlsx/Loop!A1:B1 circular reference 1 (2 cells)',
  ]);
});

it('RF-153 lists a cell that reads a range holding itself, and a cycle through a range', () => {
  const cells = [
    withFormula('A1', 'SUM(A1:A3)'),
    withFormula('C1', 'SUM(D1:D3)'),
    withFormula('D2', 'C1*2'),
  ];
  const content = dependenciesOf([book([sheet('Loop', { cells })], { fileName: 'Book.xlsx' })]);
  expect(sectionOf(content, 'Circular references')).toEqual([
    'Book.xlsx/Loop!A1 circular reference 1 (1 cell)',
    'Book.xlsx/Loop!C1 circular reference 2 (2 cells)',
    'Book.xlsx/Loop!D2 circular reference 2 (2 cells)',
  ]);
});

it('RF-153 lists a circular reference across two sheets of two workbooks', () => {
  const one = book([sheet('S', { cells: [withFormula('A1', '[1]T!A1')] })], {
    fileName: 'One.xlsx',
    externalLinks: [{ fileName: 'Two.xlsx' }],
  });
  const two = book([sheet('T', { cells: [withFormula('A1', '[1]S!A1')] })], {
    fileName: 'Two.xlsx',
    externalLinks: [{ fileName: 'One.xlsx' }],
  });
  const content = dependenciesOf([one, two]);
  expect(sectionOf(content, 'Circular references')).toEqual([
    'One.xlsx/S!A1 circular reference 1 (2 cells)',
    'Two.xlsx/T!A1 circular reference 1 (2 cells)',
  ]);
});

const models = [
  book(
    [
      sheet('S', {
        cells: [
          withFormula('A1', '[1]Rates!C4+[2]X!A1'),
          withFormula('A2', '\'[1]My Sheet\'!B2&"[1]"'),
        ],
      }),
    ],
    {
      fileName: 'Reader.xlsx',
      externalLinks: [{ fileName: 'C:\\Users\\x\\Rates.xlsx' }, { fileName: 'Other.xlsx' }],
    },
  ),
];

it('RF-153 replaces the link index by the file name and drops the folder (Q-38)', () => {
  const [reader] = projectOf(models).workbooks;
  if (reader === undefined) throw new Error('No workbook rendered');
  const formulas = fileOf(reader, 'S/formulas.md');
  expect(formulas).toContain('A1 = [Rates.xlsx]Rates!C4+[Other.xlsx]X!A1');
  expect(formulas).toContain('A2 = \'[Rates.xlsx]My Sheet\'!B2&"[1]"');
  expect(formulas).not.toContain('Users');
});

import { expect, it } from 'vitest';
import { book, cell, num, sheet } from '../../../../support/rendered-workbook-fixtures.js';
import {
  chainProject,
  dependenciesOf,
  projectOf,
  sectionOf,
  withFormula,
} from '../../../../support/dependency-fixtures.js';

const LIMITS = 'Limits reached';

it('RF-153 reads A1:XFD1048576 without expanding it, from another sheet and from its own', () => {
  const data = sheet('Data', {
    cells: [cell('A1', num(1)), cell('A2', num(2)), cell('Z9', num(3))],
  });
  const calc = sheet('Calc', { cells: [withFormula('A1', 'SUM(Data!A1:XFD1048576)')] });
  const own = sheet('Own', {
    cells: [cell('A1', num(1)), withFormula('B2', 'SUM(A1:XFD1048576)')],
  });

  const content = dependenciesOf([book([data, calc, own], { fileName: 'Book.xlsx' })]);

  expect(sectionOf(content, 'Input cells')).toEqual([
    'Book.xlsx/Data!A1:A2',
    'Book.xlsx/Data!Z9',
    'Book.xlsx/Own!A1',
  ]);
  expect(sectionOf(content, 'Circular references')).toEqual([
    'Book.xlsx/Own!B2 circular reference 1 (1 cell)',
  ]);
});

it('RF-153 reads a formula of 8,000 characters made of 2,000 references', () => {
  const formula = Array.from({ length: 2000 }, (_, i) => `A${String(i + 1)}`).join('+');
  expect(formula.length).toBeGreaterThan(7000);
  const inputs = Array.from({ length: 2000 }, (_, i) => cell(`A${String(i + 1)}`, num(i)));
  const calc = sheet('Calc', { cells: [...inputs, withFormula('C1', formula)] });

  const content = dependenciesOf([book([calc], { fileName: 'Book.xlsx' })]);

  expect(sectionOf(content, 'Input cells')).toEqual(['Book.xlsx/Calc!A1:A2000']);
  expect(sectionOf(content, LIMITS)).toEqual(['None.']);
});

it('RF-153 says which formula was read in part when it passes the token limit', () => {
  const formula = Array.from({ length: 4200 }, () => 'A1').join('+');
  const calc = sheet('Calc', { cells: [cell('A1', num(1)), withFormula('C1', formula)] });

  const content = dependenciesOf([book([calc], { fileName: 'Book.xlsx' })]);

  expect(sectionOf(content, LIMITS)).toEqual([
    'Book.xlsx/Calc!C1 read in part: more than 4096 references',
  ]);
});

it('RF-153 follows a chain of 100,000 cells and finds no circular reference', () => {
  const content = dependenciesOf(chainProject(100_000, '1'));
  expect(sectionOf(content, 'Circular references')).toEqual(['None.']);
  expect(sectionOf(content, 'Output cells')).toEqual(['Chain.xlsx/Chain!A1']);
});

it('RF-153 finds the one circular reference of a chain of 100,000 cells that ends on its start', () => {
  const content = dependenciesOf(chainProject(100_000, 'A1'));
  expect(sectionOf(content, 'Circular references')).toEqual([
    'Chain.xlsx/Chain!A1:A100000 circular reference 1 (100000 cells)',
  ]);
});

it('RF-153 stops after the step limit and says the list may be incomplete', () => {
  const cells = Array.from({ length: 3000 }, (_, i) =>
    withFormula(`A${String(i + 1)}`, 'SUM(A:A)'),
  );
  const content = dependenciesOf([book([sheet('S', { cells })], { fileName: 'Book.xlsx' })], {
    dependencies: { maxCycleWork: 20_000 },
  });
  expect(sectionOf(content, LIMITS)).toEqual([
    'Circular reference search stopped after 20000 steps; circular references may be missing',
  ]);
});

it('RF-153 writes at most the listed number of circular references and counts the rest', () => {
  const cells = Array.from({ length: 5 }, (_, i) =>
    withFormula(`A${String(i + 1)}`, `A${String(i + 1)}`),
  );
  const content = dependenciesOf([book([sheet('S', { cells })], { fileName: 'Book.xlsx' })], {
    dependencies: { maxCyclesListed: 2 },
  });
  expect(sectionOf(content, 'Circular references')).toHaveLength(2);
  expect(sectionOf(content, LIMITS)).toEqual([
    'Circular references not listed: 3 more than the limit of 2',
  ]);
});

it('RF-153 reads no more references than the limit and lists the formulas it left out', () => {
  const cells = [
    cell('A1', num(1)),
    ...Array.from({ length: 10 }, (_, i) => withFormula(`C${String(i + 1)}`, 'A1')),
  ];
  const content = dependenciesOf([book([sheet('S', { cells })], { fileName: 'Book.xlsx' })], {
    dependencies: { maxReferences: 4 },
  });
  expect(sectionOf(content, LIMITS)).toEqual([
    'Book.xlsx/S!C5:C10 not read: the project passed the limit of 4 references',
  ]);
  expect(sectionOf(content, 'Output cells')).toEqual(['Book.xlsx/S!C1:C10']);
});

it('RF-153 lists no more sheet edges than the limit and counts the rest', () => {
  const targets = ['T1', 'T2', 'T3', 'T4'].map((name) =>
    sheet(name, { cells: [cell('A1', num(1))] }),
  );
  const reader = sheet('Reader', {
    cells: [withFormula('A1', 'T1!A1+T2!A1+T3!A1+T4!A1')],
  });
  const content = dependenciesOf([book([...targets, reader], { fileName: 'Book.xlsx' })], {
    dependencies: { maxSheetEdges: 3 },
  });
  expect(sectionOf(content, 'Sheets')).toHaveLength(3);
  expect(sectionOf(content, LIMITS)).toEqual([
    'Sheet-to-sheet edges not listed: 1 more than the limit of 3',
  ]);
});

it('RF-153 keeps every line under 1,900 characters and loses nothing of a long name or file name', () => {
  const refersTo = `Data!$A$1+${'0+'.repeat(2500)}1`;
  const longFile = `${'x'.repeat(3000)}.xlsx`;
  const models = [
    book(
      [
        sheet('Data', { cells: [cell('A1', num(1))] }),
        sheet('Calc', {
          cells: [withFormula('A1', `Long*1+[1]S!A1`), withFormula('A2', `Gone!A1`)],
        }),
      ],
      {
        fileName: 'Book.xlsx',
        definedNames: [{ name: 'Long', hidden: false, refersTo }],
        externalLinks: [{ fileName: longFile }],
      },
    ),
  ];

  const content = dependenciesOf(models);

  for (const line of content.split('\n')) expect(line.length).toBeLessThan(1900);
  const names = sectionOf(content, 'Defined names').join('');
  expect(names).toContain(refersTo.slice(-500));
  expect(content).toContain('which is not uploaded');
});

it('RF-153 writes many ranges on lines that each start with the cells they describe', () => {
  const cells = [
    ...Array.from({ length: 3000 }, (_, i) => cell(`A${String(i * 2 + 1)}`, num(i))),
    withFormula('C1', `SUM(A1:A6000)`),
  ];
  const content = dependenciesOf([book([sheet('S', { cells })], { fileName: 'Book.xlsx' })]);
  const inputs = sectionOf(content, 'Input cells');
  expect(inputs).toHaveLength(3000);
  for (const line of inputs) expect(line).toMatch(/^Book\.xlsx\/S!A[0-9]+$/u);
});

it('RF-153 stops at the total byte limit of the render like every other file', () => {
  expect(() => projectOf(chainProject(200, '1'), { maxTotalBytes: 30_000 })).toThrow(/RST-1926/u);
});

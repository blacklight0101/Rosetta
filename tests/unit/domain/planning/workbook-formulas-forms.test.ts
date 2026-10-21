import { expect, it } from 'vitest';
import { workbookFormulasOf } from '../../../../src/domain/planning/workbook-formulas.js';
import { renderWorkbook } from '../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import type { WorkbookCell } from '../../../../src/infrastructure/sources/workbook/workbook-model.js';
import { book, cell, num, sheet } from '../../../support/rendered-workbook-fixtures.js';

// RF-152, RF-153, P3-94: the forms a column of formulas can take in `formulas.md`: formulas that
// differ only by the row they sit on are one formula, a column with mixed formulas lists each once,
// a long formula arrives on several lines, an array formula is marked, and a file that is not a
// `formulas.md` gives no row.

const normal = (text: string) => ({ kind: 'normal', text }) as const;

function column(letter: string, formulas: readonly string[], first = 2): WorkbookCell[] {
  return formulas.map((text, index) =>
    cell(`${letter}${String(first + index)}`, num(index + 1), { formula: normal(text) }),
  );
}

/** The rendered `formulas.md` of a one-sheet workbook with these cells. */
function filesOf(cells: readonly WorkbookCell[]) {
  const rendered = renderWorkbook(book([sheet('Data', { cells })]));
  return rendered.files
    .filter((file) => file.path.endsWith('/formulas.md'))
    .map((file) => ({ path: file.path, text: file.content }));
}

function rowsOf(cells: readonly WorkbookCell[]) {
  return workbookFormulasOf(filesOf(cells), { unread: 0 }).rows;
}

it('RF-152 lists a column of formulas that differ only by their row as one formula', () => {
  const rows = rowsOf(column('A', ['B2*0.5', 'B3*0.5', 'B4*0.5']));

  expect(rows).toHaveLength(1);
  expect(rows[0]).toMatchObject({ range: 'A2:A4', cells: 3, formula: 'B2*0.5' });
});

it('RF-152 lists each formula of a column with mixed formulas once, with the cells it fills', () => {
  const rows = rowsOf(column('A', ['B2*2', 'B3*2', 'B4*3', 'B5*2']));

  expect(rows.map((row) => [row.range, row.cells, row.formula])).toEqual([
    ['A2:A3, A5', 3, 'B2*2'],
    ['A4', 1, 'B4*3'],
  ]);
});

it('RF-152 tells a formula that fixes a cell from one that moves with the row', () => {
  const rows = rowsOf(column('A', ['$B$1*B2', '$B$1*B3', '$B$2*B4']));

  expect(rows.map((row) => [row.range, row.formula])).toEqual([
    ['A2:A3', '$B$1*B2'],
    ['A4', '$B$2*B4'],
  ]);
});

it('RF-152 does not read a function name or a quoted text as a cell', () => {
  const rows = rowsOf(column('A', ['LOG10(B2)&"A1"', 'LOG10(B3)&"A1"', 'LOG10(B4)&"A2"']));

  expect(rows.map((row) => [row.range, row.formula])).toEqual([
    ['A2:A3', 'LOG10(B2)&"A1"'],
    ['A4', 'LOG10(B4)&"A2"'],
  ]);
});

it('RF-153 writes the references to the row of a table as column names, in every form', () => {
  const rows = rowsOf([
    ...column('A', ['T1[@Price]*2', 'T1[@Price]*2']),
    ...column('B', ['T1[@[Unit Price]]+1', 'T1[@[Unit Price]]+1']),
    ...column('C', ['SUM(T1[[#This Row],[Q1]:[Q4]])', 'SUM(T1[[#This Row],[Q1]:[Q4]])']),
    ...column('D', ['"T1[@Price]"&T2[Total]', '"T1[@Price]"&T2[Total]']),
  ]);

  expect(rows.map((row) => row.formula)).toEqual([
    '[Price]*2',
    '[Unit Price]+1',
    'SUM([Q1]:[Q4])',
    '"T1[@Price]"&T2[Total]',
  ]);
});

it('RF-152 joins the lines of a long formula and of a long cached text', () => {
  const text = [
    '# Formulas of sheet "Long"',
    '- Formula cells: 1',
    '',
    '## Single cells (1 formula)',
    'A1 = SUM(B1,',
    'A1 (continued) B2)    [cached: "one two"]',
    'A1 (cached, continued) " and three"',
    '',
  ].join('\n');

  const { rows } = workbookFormulasOf([{ path: 'Long.xlsx/Long/formulas.md', text }], {
    unread: 0,
  });

  expect(rows).toMatchObject([
    { formula: 'SUM(B1,B2)', cached: [{ address: 'A1', kind: 'text', text: 'one two and three' }] },
  ]);
});

it('RF-152 reads an array formula as one row and leaves a data table out', () => {
  const text = [
    '# Formulas of sheet "Arrays"',
    '- Formula cells: 2',
    '',
    '## Array formulas',
    'F2:F9 {= SUM(A1:A8*2)}    [array; cached F2: 4]',
    '',
    '## Data tables',
    'H2:H9 {data table(no formula text)}    [data table; cached H2: 1]',
    '',
  ].join('\n');

  const { rows } = workbookFormulasOf([{ path: 'Book.xlsx/Arrays/formulas.md', text }], {
    unread: 0,
  });

  expect(rows).toMatchObject([
    { shape: 'array', range: 'F2:F9', cells: 8, formula: 'SUM(A1:A8*2)' },
  ]);
  expect(rows).toHaveLength(1);
});

it('RF-152 reads the regions of a file rendered before the table column was named', () => {
  const text = [
    '# Formulas of sheet "Old"',
    '- Formula cells: 2',
    '',
    '## Region R8:R9 (2 formulas)',
    'R8 = Table1[[#This Row],[A]]*2    [cached: 4]',
    'R9 = Table1[[#This Row],[A]]*2    [cached: 6]',
    '',
  ].join('\n');

  const { rows } = workbookFormulasOf([{ path: 'Old.xlsx/Old/formulas.md', text }], {
    unread: 0,
  });

  expect(rows).toMatchObject([{ range: 'R8:R9', formula: '[A]*2' }]);
  expect(rows[0]).not.toHaveProperty('table');
});

it('RF-152 gives no row for a file that is no formulas.md and names a sheet by its folder', () => {
  const none = workbookFormulasOf([{ path: 'x/Odd/formulas.md', text: 'not a formulas file' }], {
    unread: 0,
  });
  const text = '- Formula cells: 1\n\n## Single cells (1 formula)\nA1 = 1+1    [cached: 2]\n';
  const bare = workbookFormulasOf([{ path: 'x/Odd/formulas.md', text }], { unread: 0 });

  expect(none.rows).toEqual([]);
  expect(bare.rows).toMatchObject([{ sheet: 'Odd', workbook: 'x', formula: '1+1' }]);
});

it('RF-152 keeps at most the given rows and counts the ones left out', () => {
  const files = filesOf(column('A', ['B2*2', 'B3*3', 'B4*4', 'B5*5']));

  const limited = workbookFormulasOf(files, { unread: 2, maxRows: 3 });

  expect(limited.rows.map((row) => row.id)).toEqual(['F-001', 'F-002', 'F-003']);
  expect(limited).toMatchObject({ omitted: 1, unread: 2 });
});

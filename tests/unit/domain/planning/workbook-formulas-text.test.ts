import { expect, it } from 'vitest';
import { workbookFormulasOf } from '../../../../src/domain/planning/workbook-formulas.js';

// RF-152, RF-153, P3-94: the edges of reading a formula out of `formulas.md` as text: names that
// look like cells, notes that look like formula text, array constants, cached values of every
// kind, and lines that belong to no formula.

const rowsOf = (lines: readonly string[]) =>
  workbookFormulasOf(
    [
      {
        path: 'B.xlsx/S/formulas.md',
        text: ['# Formulas of sheet "S"', '', ...lines, ''].join('\n'),
      },
    ],
    { unread: 0 },
  ).rows;

const region = (formulas: readonly string[]): string[] => [
  `## Region A2:A${String(formulas.length + 1)} (${String(formulas.length)} formulas)`,
  ...formulas.map((formula, index) => `A${String(index + 2)} = ${formula}    [cached: 1]`),
];

it('RF-153 does not read the name of a sheet, a defined name or a column header as a cell', () => {
  const sheets = rowsOf(region(["'Q1 Data'!B2*2", "'Q1 Data'!B3*2"]));
  const names = rowsOf(region(['Rate2024*B2', 'Rate2024*B3']));
  const headers = rowsOf(region(['Tbl[[#This Row],[Q1]]*B2', 'Tbl[[#This Row],[Q1]]*B3']));

  expect([sheets.length, names.length, headers.length]).toEqual([1, 1, 1]);
});

it('RF-152 reads a number with a sign or an exponent, and a date with a time, as stored', () => {
  const rows = rowsOf([
    '## Single cells (3 formulas)',
    'A1 = 1    [cached: -3]',
    'A2 = 1    [cached: 1.5E-07]',
    'A3 = 1    [cached: 2026-03-19T09:30:00Z]',
  ]);

  expect(rows.flatMap((row) => row.cached.map((value) => [value.kind, value.text]))).toEqual([
    ['plain', '-3'],
    ['plain', '1.5E-07'],
    ['plain', '2026-03-19T09:30:00Z'],
  ]);
});

it('RF-152 takes a note only from the end of the line, and only one that reads as a note', () => {
  const rows = rowsOf([
    '## Single cells (2 formulas)',
    'A1 = "a    [b]"&B1    [cached: 2]',
    'A2 = "x"    [cached: 1] and more',
  ]);

  expect(rows.map((row) => [row.formula, row.cached.map((value) => value.text)])).toEqual([
    ['"a    [b]"&B1', ['2']],
    ['"x"    [cached: 1] and more', []],
  ]);
});

it('RF-152 keeps the braces of an array constant in a formula that is not an array formula', () => {
  const [row] = rowsOf(['## Single cells (1 formula)', 'A1 = {1,2,3}    [cached: 1]']);

  expect(row?.formula).toBe('{1,2,3}');
});

it('RF-152 reads a cached continuation that is no text as it is written', () => {
  const [row] = rowsOf([
    '## Single cells (1 formula)',
    'A1 = "x"    [cached: "ab"]',
    'A1 (cached, continued) 12',
  ]);

  expect(row?.cached).toEqual([{ address: 'A1', kind: 'text', text: 'ab12' }]);
});

it('RF-152 leaves out a continuation with nothing to continue and a line that is no cell', () => {
  const rows = rowsOf([
    '## Single cells (2 formulas)',
    'A9 (continued) lost',
    'A9 (cached, continued) "lost"',
    'A1 = 1    [cached: 1]',
    'nonsense line',
  ]);

  expect(rows.map((row) => row.range)).toEqual(['A1']);
});

it('RF-152 leaves out a line of a region whose address is no cell', () => {
  const rows = rowsOf([
    '## Region A2:A4 (3 formulas)',
    'A2 = 1    [cached: 1]',
    'nonsense = 2    [cached: 2]',
    'A4 = 1    [cached: 1]',
  ]);

  expect(rows.map((row) => [row.range, row.cells])).toEqual([['A2, A4', 2]]);
});

it('RF-152 reads a table column only after a comma in the heading', () => {
  const rows = rowsOf([
    '## Region A2:A3 (2 formulas) T column "C"',
    'A2 = 1    [cached: 1]',
    'A3 = 1    [cached: 1]',
  ]);

  expect(rows.map((row) => row.table)).toEqual([undefined]);
});

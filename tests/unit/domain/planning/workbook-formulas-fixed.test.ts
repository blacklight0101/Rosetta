import { expect, it } from 'vitest';
import { workbookFormulasOf } from '../../../../src/domain/planning/workbook-formulas.js';

// RF-152, P3-94: a reference with a fixed column ($B2) moves with the row, a fixed row does not,
// and a heading that does not put a comma before the table column names none.

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

it('RF-152 tells a fixed column that moves with the row from one that is fixed in the column', () => {
  const rows = rowsOf([
    '## Region A2:A4 (3 formulas)',
    'A2 = $B2*2    [cached: 1]',
    'A3 = $B3*2    [cached: 1]',
    'A4 = $C4*2    [cached: 1]',
  ]);

  expect(rows.map((row) => [row.range, row.formula])).toEqual([
    ['A2:A3', '$B2*2'],
    ['A4', '$C4*2'],
  ]);
});

it('RF-152 reads no table column from a heading whose suffix has no comma, however it starts', () => {
  const rows = rowsOf([
    '## Region A2:A3 (2 formulas)@@T column "C"',
    'A2 = 1    [cached: 1]',
    'A3 = 1    [cached: 1]',
  ]);

  expect(rows.map((row) => row.table)).toEqual([undefined]);
});

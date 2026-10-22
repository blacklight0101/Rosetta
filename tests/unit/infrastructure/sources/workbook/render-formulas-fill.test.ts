import { expect, it } from 'vitest';
import { workbookFormulasOf } from '../../../../../src/domain/planning/workbook-formulas.js';
import type { WorkbookCell } from '../../../../../src/infrastructure/sources/workbook/workbook-model.js';
import {
  renderWorkbook,
  WORKBOOK_RENDERER_VERSION,
} from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import {
  book,
  cell,
  fileOf,
  linesOf,
  num,
  sheet,
} from '../../../../support/rendered-workbook-fixtures.js';

// RF-150..RF-158, P3-103, EV-03, EV-22: a formula filled down a column is written once with the
// cells it fills and a few example results, not once per row. The cells that differ stay apart,
// the lines stay numbered as a citation numbers them, and the plan reads the folded form back.

const normal = (text: string) => ({ kind: 'normal', text }) as const;

/** A column of formulas built from a row number, rows `from` to `to`. */
function column(
  letter: string,
  from: number,
  to: number,
  formula: (row: number) => string,
): WorkbookCell[] {
  const cells: WorkbookCell[] = [];
  for (let row = from; row <= to; row += 1) {
    cells.push(cell(`${letter}${String(row)}`, num(row * 10), { formula: normal(formula(row)) }));
  }
  return cells;
}

function render(cells: readonly WorkbookCell[]): string {
  const rendered = renderWorkbook(book([sheet('Data', { cells })]));
  return fileOf(rendered, 'Data/formulas.md');
}

const formulaLines = (content: string): string[] =>
  linesOf(content).filter((line) => /^[A-Z]+\d+ = /u.test(line));

it('RF-152 is 3 once a filled-down region is written once', () => {
  expect(WORKBOOK_RENDERER_VERSION).toBe('3');
});

it('RF-152 writes a region of 499 equal relative formulas as one formula line', () => {
  const content = render(
    column('B', 2, 500, (row) => `SUMIFS(Other!D:D,Other!A:A,A${String(row)})`),
  );

  expect(formulaLines(content)).toHaveLength(1);
  expect(linesOf(content)).toContain('## Region B2:B500 (499 formulas)');
  expect(formulaLines(content)[0]).toBe(
    'B2 = SUMIFS(Other!D:D,Other!A:A,A2)    [499 cells: B2:B500; cached B2: 20]',
  );
});

it('RF-152 shows the next two cells as examples with their cached values after the formula', () => {
  const content = render(column('B', 2, 500, (row) => `A${String(row)}*2`));

  const lines = linesOf(content);
  const at = lines.findIndex((line) => line.startsWith('B2 = '));
  expect(lines.slice(at + 1, at + 3)).toEqual(['B3 (example) 30', 'B4 (example) 40']);
});

it('RF-152 falls under 10% of its old size for ten regions of 499 rows', () => {
  const letters = 'BCDEFGHIJK'.split('');
  const cells = letters.flatMap((letter) =>
    column(letter, 2, 500, (row) => `${letter}${String(row)}+A${String(row)}`),
  );
  const content = render(cells);
  const oldSize = 10 * 499 * 'B2 = B2+A2    [cached: 20]\n'.length;

  expect(content.length).toBeLessThan(oldSize * 0.1);
  expect(formulaLines(content)).toHaveLength(10);
});

it('RF-152 folds relative copies that differ only by the row into one region line', () => {
  const content = render(column('A', 8, 15, (row) => `R${String(row)}*0.5`));

  expect(formulaLines(content)).toEqual(['A8 = R8*0.5    [8 cells: A8:A15; cached A8: 80]']);
});

it('RF-152 lists a cell with another formula apart and keeps the runs of the others', () => {
  const cells = column('B', 2, 500, (row) => (row === 250 ? 'A250*3' : `A${String(row)}*2`));

  const content = render(cells);

  expect(formulaLines(content)).toEqual([
    'B2 = A2*2    [498 cells: B2:B249, B251:B500; cached B2: 20]',
    'B250 = A250*3    [cached: 2500]',
  ]);
  expect(linesOf(content)).toContain('## Region B2:B500 (499 formulas)');
});

it('RF-152 names every distinct formula of a region once', () => {
  const content = render(
    column('B', 2, 41, (row) => (row % 3 === 0 ? `A${String(row)}*3` : `A${String(row)}*2`)),
  );

  const lines = formulaLines(content);
  expect(lines).toHaveLength(2);
  expect(lines.join('\n')).toContain('A2*2');
  expect(lines.join('\n')).toContain('A3*3');
});

it('RF-152 writes a region of formulas that all differ as before, one line per cell', () => {
  const content = render(column('B', 2, 5, (row) => `A${String(row)}*${String(row)}`));

  expect(formulaLines(content)).toHaveLength(4);
  expect(content).not.toContain('(example)');
});

it('RF-152 keeps the table column in the heading of a folded region', () => {
  const rows = column('B', 2, 20, (row) => `A${String(row)}*2`);
  const model = book([
    sheet('Data', {
      tables: [{ name: 'Sales', range: 'A1:B20', columns: ['Qty', 'Total'] }],
      cells: rows,
    }),
  ]);

  const content = fileOf(renderWorkbook(model), 'Data/formulas.md');

  expect(linesOf(content)).toContain('## Region B2:B20 (19 formulas), Sales column "Total"');
  expect(formulaLines(content)).toHaveLength(1);
});

it('P3-74 numbers the lines of a folded region so a citation points at real lines', () => {
  const cells = [
    ...column('B', 2, 100, (row) => `A${String(row)}*2`),
    ...column('D', 2, 100, (row) => `A${String(row)}*4`),
  ];
  const content = render(cells);
  const lines = linesOf(content);

  const rows = workbookFormulasOf([{ path: 'Book.xlsx/Data/formulas.md', text: content }], {
    unread: 0,
  }).rows;

  expect(rows.map((row) => [row.range, row.cells, row.formula])).toEqual([
    ['B2:B100', 99, 'A2*2'],
    ['D2:D100', 99, 'A2*4'],
  ]);
  for (const row of rows) {
    expect(lines[row.source.startLine - 1]).toMatch(/^## Region /u);
    expect(lines.slice(row.source.startLine - 1, row.source.endLine).join('\n')).toContain(
      `${row.range.split(':')[0] ?? ''} = `,
    );
    expect(lines[row.source.endLine - 1]).toMatch(/\(example\)/u);
  }
});

it('P3-94 reads the cached results of the first and the example cells of a folded region', () => {
  const content = render(column('B', 2, 500, (row) => `A${String(row)}*2`));

  const [row] = workbookFormulasOf([{ path: 'Book.xlsx/Data/formulas.md', text: content }], {
    unread: 0,
  }).rows;

  expect(row?.cached.map((value) => [value.address, value.text])).toEqual([
    ['B2', '20'],
    ['B3', '30'],
    ['B4', '40'],
  ]);
});

it('P3-94 reads a folded region next to an irregular cell as two rows', () => {
  const content = render(column('B', 2, 50, (row) => (row === 10 ? 'A10*9' : `A${String(row)}*2`)));

  const rows = workbookFormulasOf([{ path: 'Book.xlsx/Data/formulas.md', text: content }], {
    unread: 0,
  }).rows;

  expect(rows.map((row) => [row.range, row.cells, row.formula])).toEqual([
    ['B2:B9, B11:B50', 48, 'A2*2'],
    ['B10', 1, 'A10*9'],
  ]);
});

it('RF-152 keeps a group of three equal formulas cell by cell, as the examples would show them all', () => {
  const content = render(column('B', 2, 4, (row) => `A${String(row)}*2`));

  expect(formulaLines(content)).toHaveLength(3);
  expect(content).not.toContain('(example)');
});

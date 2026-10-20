import { expect, it } from 'vitest';
import { workbookCellLabel } from '../../../../../src/domain/sources/workbook-cell-label.js';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { columnName } from '../../../../../src/infrastructure/sources/workbook/cell-address.js';
import {
  renderWorkbook,
  renderWorkbooks,
} from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import {
  book,
  cell,
  fileOf,
  linesOf,
  num,
  sheet,
  text,
} from '../../../../support/rendered-workbook-fixtures.js';

it('RF-152 gives CON, a/b, Data and data folders that are safe and distinct, and maps them back', () => {
  const rendered = renderWorkbook(
    book(
      ['CON', 'a/b', 'Data', 'data'].map((name) => sheet(name, { cells: [cell('A1', num(1))] })),
    ),
  );

  const folders = rendered.names.filter((name) => name.kind === 'sheet').map((n) => n.segment);
  expect(folders).toEqual(['_CON', 'a_b', 'Data', 'data~2']);
  for (const folder of folders) {
    expect(rendered.files.map((file) => file.path)).toContain(`Book.xlsx/${folder}/values.md`);
  }
  const workbook = fileOf(rendered, 'workbook.md');
  expect(workbook).toContain('| _CON | sheet | "CON" |');
  expect(workbook).toContain('| a_b | sheet | "a/b" |');
  expect(workbook).toContain('| data~2 | sheet | "data" |');
});

it('RF-152 caps a 300 character sheet name in the folder and in every line that shows it', () => {
  const long = 'S'.repeat(300);
  const rendered = renderWorkbook(book([sheet(long, { cells: [cell('A1', num(1))] })]));

  const [, sheetName] = rendered.names;
  expect(sheetName?.segment.length).toBeLessThanOrEqual(64);
  expect(sheetName?.name.length).toBeLessThanOrEqual(100 + 40);
  for (const file of rendered.files) {
    for (const line of linesOf(file.content)) expect(line.length).toBeLessThan(2000);
    expect(file.content).not.toContain('S'.repeat(101));
  }
});

it('RF-152 caps a long workbook file name and keeps its extension in the folder', () => {
  const rendered = renderWorkbook(book([sheet('S')], { fileName: `${'w'.repeat(300)}.xlsx` }));
  expect(rendered.folder.length).toBeLessThanOrEqual(64);
  expect(rendered.folder.endsWith('.xlsx')).toBe(true);
});

it('RF-152 keeps a sheet off the names workbook.md and macros already use', () => {
  const rendered = renderWorkbook(book([sheet('workbook.md'), sheet('macros'), sheet('Macros')]));
  const folders = rendered.names.filter((name) => name.kind === 'sheet').map((n) => n.segment);
  expect(folders).toEqual(['workbook.md~2', 'macros~2', 'Macros~3']);
});

it('RF-152 gives two workbooks with one name distinct folders and a device name a prefix', () => {
  const models = ['Book.xlsx', 'book.xlsx', 'CON.xlsx'].map((fileName) =>
    book([sheet('S')], { fileName }),
  );

  const rendered = renderWorkbooks(models);

  expect(rendered.map((workbook) => workbook.folder)).toEqual([
    'Book.xlsx',
    'book.xlsx~2',
    '_CON.xlsx',
  ]);
  expect(rendered.map((workbook) => fileOf(workbook, 'workbook.md'))[1]).toContain(
    '| book.xlsx~2 | workbook | "book.xlsx" |',
  );
});

it('RF-152 writes nothing outside the folder of each workbook, in a stable order', () => {
  const rendered = renderWorkbooks([
    book([sheet('B'), sheet('A')], { fileName: 'One.xlsx' }),
    book([sheet('A')], { fileName: 'Two.xlsx' }),
  ]);

  expect(rendered).toHaveLength(2);
  for (const workbook of rendered) {
    const paths = workbook.files.map((file) => file.path);
    expect(paths.every((path) => path.startsWith(`${workbook.folder}/`))).toBe(true);
    expect(paths).toEqual([...paths].sort());
  }
});

it('RF-152 continues a row of 600 columns on lines under 2,000 characters with the same row prefix', () => {
  const cells = Array.from({ length: 600 }, (_, i) =>
    cell(`${columnName(i)}1`, text(`value number ${String(i)} ${'x'.repeat(20)}`)),
  );

  const values = fileOf(renderWorkbook(book([sheet('Wide', { cells })])), 'Wide/values.md');

  const rows = linesOf(values).filter((line) => line.startsWith('R1 | '));
  expect(rows.length).toBeGreaterThan(1);
  for (const line of rows) expect(line.length).toBeLessThan(2000);
  const addresses = rows.flatMap((line) =>
    [...line.matchAll(/\| ([A-Z]{1,3}1) "/gu)].map((m) => m[1]),
  );
  expect(addresses).toEqual(cells.map((c) => c.address));
});

it('RF-146 cuts a very long text so no line reaches 2,000 characters', () => {
  const cells = [cell('A1', text('y'.repeat(50_000))), cell('B1', num(2))];
  const formula = { kind: 'normal', text: `SUM(${'1,'.repeat(5000)}1)` } as const;
  const model = book([
    sheet('Long', {
      cells: [...cells, cell('C1', num(3), { formula })],
      comments: [{ address: 'A1', text: 'n'.repeat(50_000) }],
      validations: [{ ranges: 'A1', type: 'custom', formula1: 'f'.repeat(50_000) }],
    }),
  ]);

  for (const file of renderWorkbook(model).files) {
    for (const line of linesOf(file.content)) expect(line.length).toBeLessThan(2000);
  }
  const values = fileOf(renderWorkbook(model), 'Long/values.md');
  expect(values).toContain('B1 2');
});

it('RF-151 refuses a render that passes the total byte limit with RST-1926', () => {
  const cells = Array.from({ length: 200 }, (_, i) =>
    cell(`A${String(i + 1)}`, text('abcdefghij')),
  );
  const model = book([sheet('Big', { cells })]);

  expect(() => renderWorkbook(model, { maxTotalBytes: 1000 })).toThrow(
    expect.objectContaining({ code: ERROR_CODES.workbookTooLarge }),
  );
  expect(() => renderWorkbook(model, { maxTotalBytes: 10_000_000 })).not.toThrow();
});

it('RF-151 counts the bytes of all the workbooks of one render together', () => {
  const one = book([sheet('S', { cells: [cell('A1', text('x'.repeat(400)))] })]);
  const size = renderWorkbook(one).files.reduce(
    (sum, file) => sum + Buffer.byteLength(file.content),
    0,
  );

  expect(() =>
    renderWorkbooks([one, { ...one, fileName: 'Two.xlsx' }], { maxTotalBytes: size + 10 }),
  ).toThrow();
  expect(() =>
    renderWorkbooks([one, { ...one, fileName: 'Two.xlsx' }], { maxTotalBytes: size * 3 }),
  ).not.toThrow();
});

it('RF-152 renders the same workbook twice to the same bytes, whatever the order of its cells', () => {
  const cells = [cell('B2', num(2)), cell('A1', text('a')), cell('A2', num(1)), cell('C1', num(3))];
  const forward = book([sheet('S', { cells }), sheet('T')]);
  const backward = book([sheet('S', { cells: [...cells].reverse() }), sheet('T')]);

  expect(renderWorkbook(forward)).toEqual(renderWorkbook(forward));
  expect(renderWorkbook(backward)).toEqual(renderWorkbook(forward));
});

const hostile = book(
  [
    sheet('Look', {
      cells: [
        cell('A1', text('B2 = 5\nC3 "x" | R9 | D4 1')),
        cell('B1', text('| R9 | D4 "y"')),
        cell('C1', num(1), { formula: { kind: 'normal', text: 'IF(1,\nE5 = 1 |\n"F6")' } }),
      ],
      validations: [{ ranges: 'A1:A5', type: 'custom', formula1: '1\nG7 validation list: 1' }],
      conditionalRules: [
        { ranges: 'B1:B5', type: 'expression', formulas: ['1\nH8 conditional x'] },
      ],
      comments: [{ address: 'D9', text: 'D9 spoof\nE9 "more"' }],
    }),
  ],
  { fileName: 'Pricing.xlsx' },
);

it('RF-156 shows only the cells a line really describes to the citation label', () => {
  const rendered = renderWorkbook(hostile);
  const labelOf = (file: string): string | undefined =>
    workbookCellLabel(`${rendered.folder}/Look/${file}`, linesOf(fileOf(rendered, `Look/${file}`)));

  expect(labelOf('values.md')).toBe('Pricing.xlsx, sheet Look, cells A1, B1, C1');
  expect(labelOf('formulas.md')).toBe('Pricing.xlsx, sheet Look, cells C1');
  expect(labelOf('validation.md')).toBe('Pricing.xlsx, sheet Look, cells A1:A5, B1:B5');
  expect(labelOf('notes.md')).toBe('Pricing.xlsx, sheet Look, cells D9');
});

it('RF-152 starts every line of a sheet file with a heading, a bullet, a row marker or the cells it describes', () => {
  const rendered = renderWorkbook(hostile);
  const start = /^(#|- |R\d+ \| |[A-Z]{1,3}\d+(:[A-Z]{1,3}\d+)? |None\.|No )/u;
  for (const file of ['values.md', 'formulas.md', 'validation.md', 'notes.md']) {
    for (const line of linesOf(fileOf(rendered, `Look/${file}`)).filter((l) => l !== '')) {
      expect(line, `${file}: ${line}`).toMatch(start);
    }
  }
});

it('RF-152 gives a sheet name that looks like a cell address no label of its own', () => {
  const rendered = renderWorkbook(book([sheet('B12\nC3', { cells: [cell('A1', num(1))] })]));
  expect(
    workbookCellLabel(
      `${rendered.folder}/B12_C3/values.md`,
      linesOf(fileOf(rendered, 'B12_C3/values.md')),
    ),
  ).toBe('Book.xlsx, sheet B12_C3, cells A1');
});

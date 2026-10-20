import { expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../../src/domain/errors/codes.js';
import { workbookCellLabel } from '../../../../../src/domain/sources/workbook-cell-label.js';
import { renderWorkbook } from '../../../../../src/infrastructure/sources/workbook/workbook-renderer.js';
import {
  book,
  cell,
  fileOf,
  linesOf,
  num,
  sheet,
  text,
} from '../../../../support/rendered-workbook-fixtures.js';

const manyRanges = (count: number): string[] =>
  Array.from({ length: count }, (_, i) => `A${String(i + 1)}:B${String(i + 1)}`);

it('RF-152 cuts a long formula, a comment and a rule at their caps with a note, not at the line limit', () => {
  const formula = { kind: 'normal', text: `SUM(${'1,'.repeat(5000)}1)` } as const;
  const model = book([
    sheet('Long', {
      cells: [cell('A1', num(1), { formula })],
      comments: [{ address: 'A1', text: 'n'.repeat(50_000) }],
      validations: [{ ranges: 'A1', type: 'custom', formula1: 'f'.repeat(50_000) }],
      conditionalRules: [{ ranges: 'A1', type: 'expression', formulas: ['g'.repeat(50_000)] }],
    }),
  ]);

  const rendered = renderWorkbook(model);

  const noted = ['formulas', 'notes', 'validation'].map((name) =>
    /\(\+\d+ characters\)/u.test(fileOf(rendered, `Long/${name}.md`)),
  );
  expect(noted).toEqual([true, true, true]);
  expect(fileOf(rendered, 'Long/formulas.md')).toContain('[cached: 1]');
});

it('RF-152 lists at most 1,000 merged ranges and counts the rest, on lines under the limit', () => {
  const model = book([sheet('Merged', { mergedRanges: manyRanges(1500) })]);

  const values = fileOf(renderWorkbook(model), 'Merged/values.md');

  expect(values).toContain('- Merged ranges not listed: 500\n');
  expect(values).not.toContain('A1200:B1200');
  const listed = linesOf(values).filter((line) => line.startsWith('- Merged ranges: '));
  expect(listed.length).toBeGreaterThan(1);
  for (const line of linesOf(values)) expect(line.length).toBeLessThan(2000);
});

it('RF-152 lists at most 1,000 rows of a list in workbook.md and counts the rest', () => {
  const definedNames = Array.from({ length: 1200 }, (_, i) => ({
    name: `Name${String(i)}`,
    hidden: false,
    refersTo: 'Sheet1!$A$1',
  }));

  const workbook = fileOf(renderWorkbook(book([sheet('S')], { definedNames })), 'workbook.md');

  expect(workbook).toContain('"Name999"');
  expect(workbook).not.toContain('"Name1000"');
  expect(workbook).toContain('- 200 more not listed');
});

it('RF-152 lists the first five formulas of a conditional rule and counts the rest', () => {
  const formulas = ['1', '2', '3', '4', '5', '6', '7', '8'];
  const model = book([
    sheet('S', { conditionalRules: [{ ranges: 'A1', type: 'expression', formulas }] }),
  ]);

  const validation = fileOf(renderWorkbook(model), 'S/validation.md');

  expect(validation).toContain('A1 conditional expression: 1 ; 2 ; 3 ; 4 ; 5 ; (+3 more)');
});

it('RF-152 quotes a range that is not a reference so it cannot pass for the cells of a line', () => {
  const tokens = Array.from({ length: 60 }, (_, i) => `A${String(i + 1)}`).join(' ');
  const model = book(
    [
      sheet('S', {
        validations: [
          { ranges: 'B5 = 1 validation x', type: 'custom', formula1: '1' },
          { ranges: tokens, type: 'custom', formula1: '1' },
          { ranges: 'a1:b2   C3', type: 'custom', formula1: '1' },
        ],
        comments: [{ address: 'D9 = x', text: 'note' }],
      }),
    ],
    { fileName: 'Pricing.xlsx' },
  );
  const rendered = renderWorkbook(model);
  const lines = linesOf(fileOf(rendered, 'S/validation.md'));

  expect(lines).toContain('"B5 = 1 validation x" validation custom: 1');
  expect(lines.some((line) => line.startsWith('"A1 A2 A3'))).toBe(true);
  expect(lines).toContain('A1:B2 C3 validation custom: 1');
  expect(linesOf(fileOf(rendered, 'S/notes.md'))).toContain('"D9 = x" "note"');
  const label = workbookCellLabel('Pricing.xlsx/S/validation.md', lines);
  expect(label).toBe('Pricing.xlsx, sheet S, cells A1:B2');
});

it('RF-152 puts a comment whose address is not a cell after the others', () => {
  const comments = [
    { address: 'zz', text: 'last' },
    { address: 'C3', text: 'c3' },
    { address: 'A1', text: 'a1' },
  ];

  const notes = fileOf(renderWorkbook(book([sheet('S', { comments })])), 'S/notes.md');

  expect(linesOf(notes).slice(-4, -1)).toEqual(['A1 "a1"', 'C3 "c3"', '"zz" "last"']);
});

it('RF-151 refuses a cell whose address is outside the sheet with RST-1927', () => {
  const model = book([sheet('S', { cells: [cell('XFE1', num(1))] })]);

  expect(() => renderWorkbook(model)).toThrow(
    expect.objectContaining({ code: ERROR_CODES.workbookNotReadable }),
  );
});

it('RF-152 writes an address in capitals and in reading order whatever the file said', () => {
  const model = book([
    sheet('S', { cells: [cell('b2', num(2)), cell('a1', text('x')), cell('A2', num(1))] }),
  ]);

  const values = fileOf(renderWorkbook(model), 'S/values.md');

  expect(values).toContain('R1 | A1 "x"\nR2 | A2 1 | B2 2\n');
});

it('RF-152 keeps a shared formula whose first cell has no index apart from the ones that name one', () => {
  const model = book([
    sheet('S', {
      cells: [
        cell('A1', num(1), { formula: { kind: 'shared', text: 'B1', range: 'A1:A3' } }),
        cell('A2', num(2), { formula: { kind: 'shared', text: '', sharedIndex: 4 } }),
      ],
    }),
  ]);

  const formulas = fileOf(renderWorkbook(model), 'S/formulas.md');

  expect(formulas).toContain('A1:A3 = B1    [written for A1; cached A1: 1]');
  expect(formulas).toContain('A2 = (shared formula 4, its text is not in the file)    [cached: 2]');
});

it('RF-152 lists the first 30 columns of a table and counts the rest', () => {
  const columns = Array.from({ length: 40 }, (_, i) => `Col${String(i)}`);
  const model = book([sheet('S', { tables: [{ name: 'T', range: 'A1:AN9', columns }] })]);

  const workbook = fileOf(renderWorkbook(model), 'workbook.md');

  expect(workbook).toContain('"Col29", ... (+10 more) |');
  expect(workbook).not.toContain('"Col30"');
});

it('RF-152 groups only formulas in neighbouring rows of one column into a region', () => {
  const formula = { kind: 'normal', text: '1' } as const;
  const cells = ['A1', 'A3', 'A4', 'B4'].map((address) => cell(address, num(1), { formula }));

  const formulas = fileOf(renderWorkbook(book([sheet('S', { cells })])), 'S/formulas.md');

  expect(formulas).toContain('## Region A3:A4 (2 formulas)');
  expect(formulas).toContain('## Single cells (2 formulas)\nA1 = 1    [cached: 1]\nB4 = 1');
});

it('RF-152 keeps a pipe out of a table cell and cuts a long reference of a defined name', () => {
  const definedNames = [{ name: 'A|B', hidden: false, refersTo: 'x'.repeat(1000) }];

  const workbook = fileOf(renderWorkbook(book([sheet('S')], { definedNames })), 'workbook.md');

  expect(workbook).toContain('| "A\\u007cB" | workbook | no | "xxxxxxxx');
  expect(workbook).toContain('...(+700 characters)" |');
});

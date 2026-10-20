import { expect, it } from 'vitest';
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

// DEC-150, Q-33: every value is rendered. A long text, formula, comment or rule formula is written
// on continuation lines that start with the same address, so no line passes the limit and nothing
// is lost.

const QUOTED = /"((?:[^"\\]|\\.)*)"/gu;

/** The JSON strings of some lines, decoded and joined. */
function decodedStrings(lines: readonly string[]): string {
  return lines
    .flatMap((line) => [...line.matchAll(QUOTED)].map((m) => m[1] ?? ''))
    .map((raw) => {
      const parsed: unknown = JSON.parse(`"${raw}"`);
      return typeof parsed === 'string' ? parsed : '';
    })
    .join('');
}

function expectShortLines(content: string): void {
  for (const line of linesOf(content)) expect(line.length).toBeLessThan(1900);
}

const LONG_TEXT = Array.from({ length: 5000 }, (_, i) => `w${String(i % 97)}`).join(' | ');

it('DEC-150 writes a text cell of any length on continuation fields with the same address', () => {
  const cells = [cell('A1', text(LONG_TEXT)), cell('B1', num(2))];

  const values = fileOf(renderWorkbook(book([sheet('S', { cells })])), 'S/values.md');

  expectShortLines(values);
  const rows = linesOf(values).filter((line) => line.startsWith('R1 | '));
  expect(rows.length).toBeGreaterThan(5);
  expect(values).toContain('A1 (continued) "');
  expect(decodedStrings(rows.map((line) => line.replace(/ \| B1 2$/u, '')))).toBe(LONG_TEXT);
  expect(values).toContain('| B1 2');
  expect(values).not.toMatch(/characters\)/u);
});

it('DEC-150 writes a long formula and its long cached text without losing a character', () => {
  const body = `CONCATENATE(${Array.from({ length: 3000 }, (_, i) => `"p${String(i)}"`).join(',')})`;
  const cached = 'c'.repeat(3000);
  const formula = { kind: 'normal', text: body } as const;
  const model = book([sheet('S', { cells: [cell('A1', text(cached), { formula })] })]);

  const formulas = fileOf(renderWorkbook(model), 'S/formulas.md');

  expectShortLines(formulas);
  const lines = linesOf(formulas).filter((line) => line.startsWith('A1 '));
  const formulaLines = lines.filter((line) => !line.includes('(cached, continued)'));
  const joined = formulaLines
    .map((line, i) => (i === 0 ? line.replace('A1 = ', '') : line.replace('A1 (continued) ', '')))
    .map((line) => line.replace(/ {4}\[cached: .*$/u, ''))
    .join('');
  expect(joined).toBe(body);
  const cachedLines = lines
    .filter((line) => line.includes('[cached: ') || line.includes('(cached, continued)'))
    .map((line) => line.slice(line.indexOf('"')).replace(/^.*?\[cached: /u, ''));
  expect(decodedStrings(cachedLines)).toBe(cached);
  expect(formulas).not.toMatch(/characters\)/u);
});

it('DEC-150 writes a long shared formula, an array formula and their notes', () => {
  const body = 'SUM(' + '1+'.repeat(2500) + '1)';
  const shared = { kind: 'shared', text: body, range: 'B2:B9', sharedIndex: 0 } as const;
  const array = { kind: 'array', text: body, range: 'D2:D4' } as const;
  const cells = [cell('B2', num(1), { formula: shared }), cell('D2', num(1), { formula: array })];

  const formulas = fileOf(renderWorkbook(book([sheet('S', { cells })])), 'S/formulas.md');

  expectShortLines(formulas);
  const arrayLines = linesOf(formulas).filter((line) => line.startsWith('D2'));
  expect(arrayLines.length).toBeGreaterThan(2);
  expect(arrayLines[0]?.startsWith('D2:D4 {= SUM(')).toBe(true);
  expect(arrayLines.at(-1)).toMatch(/1\)\} {4}\[array; cached D2: 1\]$/u);
  expect(linesOf(formulas).filter((line) => line.startsWith('B2')).length).toBeGreaterThan(2);
});

it('DEC-150 writes a long comment on continuation lines with its address', () => {
  const comments = [{ address: 'C3', text: LONG_TEXT }];

  const notes = fileOf(renderWorkbook(book([sheet('S', { comments })])), 'S/notes.md');

  expectShortLines(notes);
  const lines = linesOf(notes).filter((line) => line.startsWith('C3 '));
  expect(lines.length).toBeGreaterThan(5);
  expect(decodedStrings(lines)).toBe(LONG_TEXT);
});

it('DEC-150 writes every formula of a rule and a long formula on continuation lines', () => {
  const long = 'f'.repeat(5000);
  const formulas = Array.from({ length: 8 }, (_, i) => `RULE${String(i)}`);
  const model = book(
    [
      sheet('S', {
        validations: [{ ranges: 'A1:A5 C1', type: 'custom', formula1: long }],
        conditionalRules: [{ ranges: 'B1:B5', type: 'expression', formulas }],
      }),
    ],
    { fileName: 'Pricing.xlsx' },
  );

  const validation = fileOf(renderWorkbook(model), 'S/validation.md');

  expectShortLines(validation);
  const rule = linesOf(validation).filter((line) => line.startsWith('A1:A5 C1 validation'));
  expect(rule.length).toBeGreaterThan(3);
  expect(rule.join('').replaceAll(/A1:A5 C1 validation (?:custom|\(continued\)): /gu, '')).toBe(
    long,
  );
  for (let i = 0; i < 8; i += 1) expect(validation).toContain(`RULE${String(i)}`);
  expect(validation).not.toMatch(/more\)|characters\)/u);
  const label = workbookCellLabel('Pricing.xlsx/S/validation.md', linesOf(validation));
  expect(label).toBe('Pricing.xlsx, sheet S, cells A1:A5, C1, B1:B5');
});

it('DEC-150 keeps a long defined-name reference whole, and valid tables of many long columns', () => {
  const columns = Array.from({ length: 60 }, (_, i) => `Column ${String(i)} ${'n'.repeat(80)}`);
  const refersTo = `Sheet1!${'$A$1,'.repeat(1500)}$A$2`;
  const model = book([sheet('S', { tables: [{ name: 'T', range: 'A1:BH9', columns }] })], {
    definedNames: [{ name: 'Long', hidden: false, refersTo }],
  });

  const workbook = fileOf(renderWorkbook(model), 'workbook.md');

  expectShortLines(workbook);
  expect(workbook).not.toContain(' ...\n');
  for (const line of linesOf(workbook).filter((l) => l.startsWith('|'))) {
    expect(line.endsWith('|')).toBe(true);
  }
  expect(workbook).toContain('| S | "T" | "A1:BH9" | 60 |');
  const columnLines = linesOf(workbook).filter((line) => line.startsWith('- S "T": '));
  expect(columnLines.length).toBeGreaterThan(1);
  for (const name of columns) expect(columnLines.join('\n')).toContain(name);
  const reference = linesOf(workbook).filter((line) => line.includes('"Long"'));
  expect(decodedStrings(reference.map((line) => line.replace('"Long"', '')))).toBe(refersTo);
});

import { expect, it } from 'vitest';
import {
  extractReferences,
  MAX_REFERENCES_PER_FORMULA,
} from '../../../../../src/infrastructure/sources/workbook/formula-references.js';
import { refsOf } from '../../../../support/formula-reference-text.js';

it('RF-153 reads cells, absolute forms and ranges', () => {
  expect(refsOf('A1+$B$2+C$3+$D4+E5:F9+$G$1:$H$2')).toEqual([
    'A1',
    '$B$2',
    'C$3',
    '$D4',
    'E5:F9',
    '$G$1:$H$2',
  ]);
});

it('RF-153 reads whole columns and whole rows', () => {
  expect(refsOf('SUM(A:A)+SUM(1:1)+SUM($B:$D,$2:$5)')).toEqual(['A:A', '1:1', '$B:$D', '$2:$5']);
});

it('RF-153 reads a range as one range and never as the cells it covers', () => {
  const [ref] = extractReferences('SUM(A1:XFD1048576)').references;
  expect(ref).toMatchObject({ kind: 'range', box: { c1: 0, r1: 1, c2: 16_383, r2: 1_048_576 } });
  expect(extractReferences('SUM(A1:XFD1048576)').references).toHaveLength(1);
});

it('RF-153 reads sheet-qualified and quoted sheet names, with a doubled quote', () => {
  expect(refsOf("Rates!A1+'My sheet'!B2+'It''s'!A1+Rates!$C$4:$C$9")).toEqual([
    'Rates!A1',
    'My sheet!B2',
    "It's!A1",
    'Rates!$C$4:$C$9',
  ]);
});

it('RF-153 reads a three-dimensional range as one reference over a span of sheets', () => {
  expect(refsOf("SUM(Sheet1:Sheet3!B2)+SUM('Sheet 1:Sheet 3'!A1:A4)")).toEqual([
    'Sheet1:Sheet3!B2',
    'Sheet 1:Sheet 3!A1:A4',
  ]);
});

it('RF-153 reads external references in the file form, the stored form and the quoted form', () => {
  expect(
    refsOf("[Book.xlsx]Sheet!A1+[1]Sheet!A1+'[Book.xlsx]My Sheet'!B2+[2]!TaxRate+[0]S!A1"),
  ).toEqual([
    '[Book.xlsx]Sheet!A1',
    '[1]Sheet!A1',
    '[Book.xlsx]My Sheet!B2',
    'name:[2]!TaxRate',
    '[0]S!A1',
  ]);
});

it('RF-153 keeps only the file name of an external reference that names a folder (Q-38)', () => {
  const formula = String.raw`'C:\Users\x\[Rates.xlsx]Sheet1'!A1+'/home/x/[Other.xlsx]S'!B1`;
  expect(refsOf(formula)).toEqual(['[Rates.xlsx]Sheet1!A1', '[Other.xlsx]S!B1']);
});

it('RF-153 reads structured table references', () => {
  expect(
    refsOf('Table1[Price]+Table1[[#This Row],[Price]]+[@Qty]+Table1[#All]+Table1[[A]:[B]]'),
  ).toEqual([
    'table:Table1[Price]',
    'table:Table1[[#This Row],[Price]]',
    'table:[@Qty]',
    'table:Table1[#All]',
    'table:Table1[[A]:[B]]',
  ]);
});

it("RF-153 reads a table column whose name holds an escaped bracket and a quote ('[ and '')", () => {
  expect(refsOf("T[Name '[x']]+B1")).toEqual(["table:T[Name '[x']]", 'B1']);
});

it('RF-153 reads defined names, and a name that looks like a cell only when the file defines it', () => {
  expect(refsOf('TaxRate*A1+TAXRATE2', ['TaxRate'])).toEqual(['name:TaxRate', 'A1']);
  expect(refsOf('TAX1*2', ['TAX1'])).toEqual(['name:TAX1']);
  expect(refsOf('TAX1*2')).toEqual(['TAX1']);
  expect(refsOf('XFE1+XFD1', ['XFE1'])).toEqual(['name:XFE1', 'XFD1']);
  expect(refsOf('Sheet1!MyName', ['MyName'])).toEqual(['name:Sheet1!MyName']);
});

it('RF-153 marks INDIRECT and OFFSET as dynamic and still reads the cells beside them', () => {
  expect(refsOf('INDIRECT("B"&ROW())')).toEqual(['dynamic:INDIRECT']);
  expect(refsOf('SUM(OFFSET(A1,1,1,2,2))+_xlfn.INDIRECT(B1)')).toEqual([
    'dynamic:OFFSET',
    'A1',
    'dynamic:INDIRECT',
    'B1',
  ]);
});

it('RF-153 skips a string literal that looks like a cell, including a doubled quote', () => {
  expect(refsOf('"A1"')).toEqual([]);
  expect(refsOf('IF(B1>0,"C3 and Sheet1!D4",E5)&"say ""F6"""&G7')).toEqual(['B1', 'E5', 'G7']);
});

it('RF-153 skips function names, numbers, booleans and error values', () => {
  expect(refsOf('LOG10(100)+ATAN2(1,2)+STDEV.S(A1)+1E5+1.5E+3+.5+TRUE+#REF!+Sheet1!#REF!')).toEqual(
    ['A1'],
  );
});

it('RF-153 skips a string with a bracket, a quote or an exclamation mark in it', () => {
  expect(refsOf('"[1]Sheet!A1\'"&B2')).toEqual(['B2']);
});

it('RF-153 reads a formula of 8,000 characters made of 2,000 references in order', () => {
  const formula = Array.from({ length: 2000 }, (_, i) => `A${String(i + 1)}`).join('+');
  expect(formula.length).toBeGreaterThan(7000);
  const result = extractReferences(formula);
  expect(result.references).toHaveLength(2000);
  expect(result.truncated).toBe(false);
});

it('RF-153 stops at the token limit and says so', () => {
  const formula = Array.from({ length: MAX_REFERENCES_PER_FORMULA + 500 }, () => 'A1').join('+');
  const result = extractReferences(formula);
  expect(result.references).toHaveLength(MAX_REFERENCES_PER_FORMULA);
  expect(result.truncated).toBe(true);
});

it.each([
  ['unclosed quote', "'".repeat(5000)],
  ['unclosed bracket', '['.repeat(5000)],
  ['unclosed string', `"${'A1,'.repeat(3000)}`],
  ['nested brackets', `T${'[['.repeat(2000)}`],
  ['colons', 'A1:'.repeat(3000)],
  ['bangs', 'S!'.repeat(3000)],
  ['long word', 'A'.repeat(30_000)],
  ['long digits', `1${'0'.repeat(30_000)}:1`],
  ['quoted ending in colon', `'${'a:'.repeat(2000)}'!A1`],
])('RF-153 ends on hostile input (%s) with a bounded result', (_name, formula) => {
  const started = Date.now();
  const result = extractReferences(formula);
  expect(result.references.length).toBeLessThanOrEqual(MAX_REFERENCES_PER_FORMULA);
  expect(Date.now() - started).toBeLessThan(2000);
});

it('RF-153 reads at most the first 32,768 characters of a formula and says so', () => {
  const formula = `${'1+'.repeat(20_000)}A1`;
  const result = extractReferences(formula);
  expect(result.references).toEqual([]);
  expect(result.truncated).toBe(true);
});

import { expect, it } from 'vitest';
import { allocateSegments } from '../../../../../src/infrastructure/sources/workbook/workbook-segments.js';

const one = (name: string): string | undefined => allocateSegments([name])[0];

it('RF-152 keeps letters, digits, dot, underscore and hyphen and turns the rest into one underscore', () => {
  expect(one('Summary-1.v2_x')).toBe('Summary-1.v2_x');
  expect(one('Rates 2026')).toBe('Rates_2026');
  expect(one('a / b')).toBe('a_b');
  expect(one('Résumé')).toBe('R_sum_');
});

it('RF-152 turns a path separator and a colon into a safe segment', () => {
  expect(one('a/b')).toBe('a_b');
  expect(one('a\\b:c')).toBe('a_b_c');
  expect(one('../x')).toBe('.._x');
});

it('RF-152 never gives an empty segment, a dot-only segment or a trailing dot', () => {
  expect(one('')).toBe('_');
  expect(one('***')).toBe('_');
  expect(one('..')).toBe('_');
  expect(one('.')).toBe('_');
  expect(one('name.')).toBe('name');
  expect(one('name..')).toBe('name');
});

it('RF-152 prefixes a Windows device name, with or without an extension', () => {
  expect(one('CON')).toBe('_CON');
  expect(one('nul')).toBe('_nul');
  expect(one('COM1')).toBe('_COM1');
  expect(one('LPT9')).toBe('_LPT9');
  expect(one('NUL.txt')).toBe('_NUL.txt');
  expect(one('CONSOLE')).toBe('CONSOLE');
  expect(allocateSegments(['con.xlsx'], { keepExtension: true })).toEqual(['_con.xlsx']);
});

it('RF-152 cuts a segment to 64 characters', () => {
  expect(one('x'.repeat(300))).toBe('x'.repeat(64));
  expect(one('CON'.repeat(100))?.length).toBe(64);
});

it('RF-152 keeps the extension of a workbook folder when the name is cut', () => {
  const [folder] = allocateSegments([`${'x'.repeat(100)}.xlsx`], { keepExtension: true });
  expect(folder).toBe(`${'x'.repeat(59)}.xlsx`);
  expect(folder?.length).toBe(64);
});

it('RF-152 adds ~2, ~3 to a clash and compares names without regard to case', () => {
  expect(allocateSegments(['Data', 'data', 'DATA', 'Other'])).toEqual([
    'Data',
    'data~2',
    'DATA~3',
    'Other',
  ]);
  expect(allocateSegments(['a b', 'a/b', 'a_b'])).toEqual(['a_b', 'a_b~2', 'a_b~3']);
});

it('RF-152 puts the clash suffix after the extension of a workbook folder', () => {
  expect(allocateSegments(['Book.xlsx', 'book.xlsx'], { keepExtension: true })).toEqual([
    'Book.xlsx',
    'book.xlsx~2',
  ]);
});

it('RF-152 keeps a sheet off the names the workbook folder already uses', () => {
  const names = ['workbook.md', 'macros', 'Macros', 'Summary'];
  expect(allocateSegments(names, { reserved: ['workbook.md', 'macros'] })).toEqual([
    'workbook.md~2',
    'macros~2',
    'Macros~3',
    'Summary',
  ]);
});

it('RF-152 is repeatable for the same names', () => {
  const names = ['b', 'B', 'CON', 'a/b', 'a b', ''];
  expect(allocateSegments(names)).toEqual(allocateSegments(names));
});

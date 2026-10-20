import { expect, it } from 'vitest';
import {
  bareValue,
  valueFields,
} from '../../../../../src/infrastructure/sources/workbook/cell-value-text.js';
import { cell, num, text } from '../../../../support/rendered-workbook-fixtures.js';

const withFormat = (value: number, numberFormat: string, date1904 = false): string | undefined =>
  bareValue(cell('A1', num(value), { numberFormat }), date1904);

it('RF-152 writes numbers as stored, booleans and errors as Excel writes them', () => {
  expect(bareValue(cell('A1', num(1250)), false)).toBe('1250');
  expect(bareValue(cell('A1', num(0.1)), false)).toBe('0.1');
  expect(bareValue(cell('A1', { type: 'boolean', value: true }), false)).toBe('TRUE');
  expect(bareValue(cell('A1', { type: 'boolean', value: false }), false)).toBe('FALSE');
  expect(bareValue(cell('A1', { type: 'error', value: '#N/A' }), false)).toBe('#N/A');
  expect(bareValue(cell('A1', { type: 'error', value: '#DIV/0!' }), false)).toBe('#DIV/0!');
});

it('RF-152 quotes an error text that is not an Excel error', () => {
  const hostile = bareValue(cell('A1', { type: 'error', value: '#X\nB2 "y"' }), false);
  expect(hostile).toBe('"#X\\nB2 \\"y\\""');
});

it('RF-152 quotes text with JSON escaping', () => {
  expect(bareValue(cell('A1', text('a | b\n"c"')), false)).toBe('"a | b\\n\\"c\\""');
});

it('RF-152 writes an ISO date for a number with a date format', () => {
  expect(withFormat(45000, 'mm-dd-yy')).toBe('2023-03-15');
  expect(withFormat(45000, 'yyyy-mm-dd')).toBe('2023-03-15');
  expect(withFormat(45000, 'dd/mm/yyyy')).toBe('2023-03-15');
  expect(withFormat(45000, '[$-409]d-mmm-yy;@')).toBe('2023-03-15');
  expect(withFormat(45000, 'mmm-yy')).toBe('2023-03-15');
});

it('RF-152 writes a date with a time and a time alone', () => {
  expect(withFormat(45000.5, 'dd/mm/yyyy hh:mm')).toBe('2023-03-15T12:00:00');
  expect(withFormat(45000.75, 'm/d/yy h:mm')).toBe('2023-03-15T18:00:00');
  expect(withFormat(0.75, 'h:mm')).toBe('18:00:00');
  expect(withFormat(0.5, 'h:mm:ss AM/PM')).toBe('12:00:00');
  expect(withFormat(1.5, '[h]:mm:ss')).toBe('36:00:00');
  expect(withFormat(0.0105, 'mm:ss')).toBe('00:15:07');
});

it('RF-152 follows the 1900 date system, including the day Excel invents', () => {
  expect(withFormat(1, 'yyyy-mm-dd')).toBe('1900-01-01');
  expect(withFormat(59, 'yyyy-mm-dd')).toBe('1900-02-28');
  expect(withFormat(60, 'yyyy-mm-dd')).toBe('1900-02-29');
  expect(withFormat(61, 'yyyy-mm-dd')).toBe('1900-03-01');
});

it('RF-152 follows the 1904 date system', () => {
  expect(withFormat(0, 'yyyy-mm-dd', true)).toBe('1904-01-01');
  expect(withFormat(1461, 'yyyy-mm-dd', true)).toBe('1908-01-01');
});

it('RF-152 leaves a number alone when its format is not a date or its serial is not a date', () => {
  expect(withFormat(45000, '0.00')).toBe('45000');
  expect(withFormat(45000, '#,##0 "days"')).toBe('45000');
  expect(withFormat(45000, '"d"0')).toBe('45000');
  expect(withFormat(45000, '0.00E+00')).toBe('45000');
  expect(withFormat(45000, '[Red]0')).toBe('45000');
  expect(withFormat(-5, 'yyyy-mm-dd')).toBe('-5');
  expect(withFormat(1e12, 'yyyy-mm-dd')).toBe('1000000000000');
  expect(withFormat(0.5, 'yyyy-mm-dd')).toBe('1900-01-00');
});

it('RF-152 does not analyse a format code of more than 256 characters', () => {
  expect(withFormat(45000, 'd'.repeat(300))).toBe('45000');
  expect(withFormat(45000, 'd'.repeat(200))).toBe('2023-03-15');
});

it('RF-152 passes a stored date through when it is an ISO date', () => {
  expect(bareValue(cell('A1', { type: 'date', value: '2026-03-01T10:00:00Z' }), false)).toBe(
    '2026-03-01T10:00:00Z',
  );
  expect(bareValue(cell('A1', { type: 'date', value: '2026-03-01\nB2 x' }), false)).toBe(
    '"2026-03-01\\nB2 x"',
  );
});

it('RF-152 has nothing to write for a formula stored without a result', () => {
  const formula = { kind: 'normal', text: 'B1' } as const;
  expect(bareValue(cell('A1', undefined, { formula }), false)).toBeUndefined();
});

it('RF-152 starts with the address and marks a cached formula result with (f)', () => {
  const formula = { kind: 'normal', text: 'B2*C2' } as const;
  expect(valueFields(cell('D2', num(5000), { formula }), false)).toEqual(['D2 5000 (f)']);
  expect(valueFields(cell('A2', text('North')), false)).toEqual(['A2 "North"']);
});

it('RF-152 says so when a formula has no cached value', () => {
  const formula = { kind: 'normal', text: 'B2' } as const;
  expect(valueFields(cell('D2', undefined, { formula }), false)).toEqual([
    'D2 (f, no cached value)',
  ]);
});

it('RF-152 leaves a serial number that would pass the year 9999 in the 1904 system as a number', () => {
  const cellOf = cell('A1', num(2958465), { numberFormat: 'yyyy-mm-dd' });
  expect(bareValue(cellOf, true)).toBe('2958465');
  expect(bareValue(cellOf, false)).toBe('9999-12-31');
});

it('RF-152 leaves a number with a General, Standard or Scientific format a number', () => {
  const formats = [
    'General',
    'General_)',
    'General;General',
    '[$-409]General',
    '[Red]General',
    'General" kg"',
    'Standard',
    'Scientific',
    'general',
    '0.00_);(0.00)',
    '"Seconds: "0',
  ];
  expect(formats.map((format) => withFormat(1234.5, format))).toEqual(formats.map(() => '1234.5'));
});

it('RF-152 still reads true date and time formats around words and sections', () => {
  expect(withFormat(45000, 'yyyy-mm-dd;@')).toBe('2023-03-15');
  expect(withFormat(45000, '[$-F800]dddd, mmmm dd, yyyy')).toBe('2023-03-15');
  expect(withFormat(0.75, 'h:mm;@')).toBe('18:00:00');
  expect(withFormat(45000.5, '[Red]d/m/yy h:mm')).toBe('2023-03-15T12:00:00');
  expect(withFormat(45000, 'General;yyyy-mm-dd')).toBe('45000');
});

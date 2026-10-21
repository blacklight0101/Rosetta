import { expect, it } from 'vitest';
import {
  headingTable,
  parseNote,
  splitNote,
  unquoted,
  valueOf,
} from '../../../../src/domain/planning/formula-note.js';

// RF-152, P3-94: the notes and headings of `formulas.md` read as text, one function at a time.

it('RF-152 reads a JSON text and nothing else as a text', () => {
  expect(unquoted('"a b"')).toBe('a b');
  expect(unquoted('12')).toBeUndefined();
  expect(unquoted('null')).toBeUndefined();
  expect(unquoted('"open')).toBeUndefined();
});

it('RF-152 reads a table column from a heading only after a comma, and only a whole one', () => {
  expect(headingTable(', InvoiceTable column "Total"')).toEqual({
    table: 'InvoiceTable',
    column: 'Total',
  });
  expect(headingTable(', "My table" column "Total"')).toEqual({
    table: 'My table',
    column: 'Total',
  });
  expect(headingTable('@@InvoiceTable column "Total"')).toBeUndefined();
  expect(headingTable(', InvoiceTable column Total')).toBeUndefined();
  expect(headingTable(', "bad column "Total"')).toBeUndefined();
  expect(headingTable('')).toBeUndefined();
  expect(headingTable(undefined)).toBeUndefined();
});

it('RF-152 tells a number, a date, a boolean and an error from a text', () => {
  expect(valueOf('12')).toEqual({ kind: 'plain', text: '12' });
  expect(valueOf('2026-03-19')).toEqual({ kind: 'plain', text: '2026-03-19' });
  expect(valueOf('TRUE')).toEqual({ kind: 'plain', text: 'TRUE' });
  expect(valueOf('#N/A')).toEqual({ kind: 'plain', text: '#N/A' });
  expect(valueOf('"12"')).toEqual({ kind: 'text', text: '12' });
  expect(valueOf('12 apples')).toEqual({ kind: 'text', text: '12 apples' });
});

it('RF-152 splits a line at the note that ends it, and only at a note', () => {
  expect(splitNote('A = 1    [cached: 2]')).toEqual({ text: 'A = 1', note: 'cached: 2' });
  expect(splitNote('A = 1    [other]')).toEqual({ text: 'A = 1    [other]', note: undefined });
  expect(splitNote('A = 1    [cached: 2] more')).toEqual({
    text: 'A = 1    [cached: 2] more',
    note: undefined,
  });
});

it('RF-152 reads the table column and the cached value of a note', () => {
  expect(parseNote('T column "C"; cached: 5')).toEqual({
    table: { table: 'T', column: 'C' },
    cached: { kind: 'plain', text: '5' },
  });
  expect(parseNote('written for O8; cached O8: 87.5')).toEqual({
    cached: { kind: 'plain', text: '87.5' },
  });
  expect(parseNote('no cached value')).toEqual({});
  expect(parseNote(undefined)).toEqual({});
});

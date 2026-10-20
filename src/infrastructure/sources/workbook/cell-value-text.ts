import { dateSpecOf, serialToIso } from './excel-dates.js';
import type { CellValue, WorkbookCell } from './workbook-model.js';
import { splitText } from './workbook-text.js';

// RF-152, DEC-150: one cell as text. Text is a JSON string (a `|` or a line break cannot break the
// line), numbers are written as stored, a number with a date format is an ISO date, errors are
// written as Excel writes them and a cached formula result is marked `(f)`. A text longer than a
// piece is written as several pieces, each a JSON string, so no cell is cut for good.

/** The escaped characters of one piece of a cell's text on a values line. */
const VALUE_CHUNK = 1000;

const EXCEL_ERROR = /^#[A-Z0-9/!?]{1,10}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[0-9:.]{1,20}(?:Z|[+-]\d{2}:\d{2})?)?$/u;

function numberText(cell: WorkbookCell, value: number, date1904: boolean): string {
  const spec = cell.numberFormat === undefined ? undefined : dateSpecOf(cell.numberFormat);
  return (spec === undefined ? undefined : serialToIso(value, date1904, spec)) ?? String(value);
}

function quotedPieces(text: string, chunk: number): string[] {
  return splitText(text, chunk, true).map((piece) => `"${piece}"`);
}

function pieces(cell: WorkbookCell, value: CellValue, date1904: boolean, chunk: number): string[] {
  switch (value.type) {
    case 'number':
      return [numberText(cell, value.value, date1904)];
    case 'boolean':
      return [value.value ? 'TRUE' : 'FALSE'];
    case 'error':
      return EXCEL_ERROR.test(value.value) ? [value.value] : quotedPieces(value.value, chunk);
    case 'date':
      return ISO_DATE.test(value.value) ? [value.value] : quotedPieces(value.value, chunk);
    case 'text':
      return quotedPieces(value.value, chunk);
  }
}

/**
 * The value of a cell as text without any mark, in pieces of at most `chunk` escaped characters (a
 * text can need several); `undefined` for a formula stored without a result.
 */
export function valueParts(
  cell: WorkbookCell,
  date1904: boolean,
  chunk: number = VALUE_CHUNK,
): string[] | undefined {
  return cell.value === undefined ? undefined : pieces(cell, cell.value, date1904, chunk);
}

/** The value of a cell as one text, or its first piece when a text needs more than one. */
export function bareValue(cell: WorkbookCell, date1904: boolean): string | undefined {
  return valueParts(cell, date1904)?.[0];
}

/**
 * The fields of a values line for one cell: the address, then the value, then `(f)` for a formula
 * result; a long text goes on, one piece per field, as `A1 (continued) "..."`.
 */
export function valueFields(cell: WorkbookCell, date1904: boolean): string[] {
  const parts = valueParts(cell, date1904);
  const formula = cell.formula !== undefined;
  const [first, ...rest] = parts ?? [];
  if (first === undefined) return [formula ? `${cell.address} (f, no cached value)` : cell.address];
  return [
    `${cell.address} ${first}${formula ? ' (f)' : ''}`,
    ...rest.map((piece) => `${cell.address} (continued) ${piece}`),
  ];
}

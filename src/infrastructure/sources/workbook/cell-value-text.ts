import { dateSpecOf, serialToIso } from './excel-dates.js';
import type { CellValue, WorkbookCell } from './workbook-model.js';
import { quoteText } from './workbook-text.js';

// RF-152: one cell as text. Text is a JSON string (a `|` or a line break cannot break the line),
// numbers are written as stored, a number with a date format is an ISO date, errors are written as
// Excel writes them and a cached formula result is marked `(f)`.

/** The longest text of one cell written on a values line; more is cut with a note. */
const VALUE_CAP = 1000;

const EXCEL_ERROR = /^#[A-Z0-9/!?]{1,10}$/u;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:T[0-9:.]{1,20}(?:Z|[+-]\d{2}:\d{2})?)?$/u;

function numberText(cell: WorkbookCell, value: number, date1904: boolean): string {
  const spec = cell.numberFormat === undefined ? undefined : dateSpecOf(cell.numberFormat);
  return (spec === undefined ? undefined : serialToIso(value, date1904, spec)) ?? String(value);
}

function valueText(
  cell: WorkbookCell,
  value: CellValue,
  date1904: boolean,
  maxChars: number,
): string {
  switch (value.type) {
    case 'number':
      return numberText(cell, value.value, date1904);
    case 'boolean':
      return value.value ? 'TRUE' : 'FALSE';
    case 'error':
      return EXCEL_ERROR.test(value.value) ? value.value : quoteText(value.value, maxChars);
    case 'date':
      return ISO_DATE.test(value.value) ? value.value : quoteText(value.value, maxChars);
    case 'text':
      return quoteText(value.value, maxChars);
  }
}

/** The value of a cell as text without any mark; `undefined` for a formula stored without a result. */
export function bareValue(
  cell: WorkbookCell,
  date1904: boolean,
  maxChars: number = VALUE_CAP,
): string | undefined {
  return cell.value === undefined ? undefined : valueText(cell, cell.value, date1904, maxChars);
}

/** The field of a values line: the address, then the value, then `(f)` for a formula result. */
export function valueField(cell: WorkbookCell, date1904: boolean): string {
  const value = bareValue(cell, date1904);
  const formula = cell.formula !== undefined;
  if (value === undefined) return formula ? `${cell.address} (f, no cached value)` : cell.address;
  return `${cell.address} ${value}${formula ? ' (f)' : ''}`;
}

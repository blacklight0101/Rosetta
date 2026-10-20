import { valueField } from './cell-value-text.js';
import { canonicalRange, type PlacedCell } from './cell-order.js';
import type { ByteBudget } from './render-output.js';
import { TextFile } from './render-output.js';
import type { WorkbookSheet } from './workbook-model.js';
import { NAME_CAP, quoteText } from './workbook-text.js';

// RF-152, RFC-005 section 4.4: `values.md`, every non-empty cell of a sheet, one line per row. Each
// line starts with its row (`R2 | `) and carries the address of every cell it holds; a row too wide
// for one line continues on the next with the same row prefix.

/** The merged ranges listed in a header; the rest are counted. */
const MERGED_LISTED = 1000;

export function rangeText(range: string): string {
  return canonicalRange(range) ?? quoteText(range, 40);
}

function addHeader(file: TextFile, sheet: WorkbookSheet, cells: number): void {
  file.add(`# Values of sheet ${quoteText(sheet.name, NAME_CAP)}`);
  file.add(`- State: ${sheet.state}`);
  file.add(
    `- Used range: ${sheet.usedRange === undefined ? '(none)' : rangeText(sheet.usedRange)}`,
  );
  const merged = sheet.mergedRanges.slice(0, MERGED_LISTED).map(rangeText);
  if (merged.length > 0) file.addWrapped('- Merged ranges: ', merged, ', ');
  const more = sheet.mergedRanges.length - merged.length;
  if (more > 0) file.add(`- Merged ranges not listed: ${String(more)}`);
  file.add(`- Non-empty cells: ${String(cells)}`);
}

/** The cells grouped by row: each row's number and the field of each of its cells. */
function* rowsOf(
  placed: readonly PlacedCell[],
  date1904: boolean,
): Generator<{ row: number; fields: string[] }> {
  let current: { row: number; fields: string[] } | undefined;
  for (const { cell, row } of placed) {
    if (current?.row !== row) {
      if (current !== undefined) yield current;
      current = { row, fields: [] };
    }
    current.fields.push(valueField(cell, date1904));
  }
  if (current !== undefined) yield current;
}

export function renderValues(
  sheet: WorkbookSheet,
  placed: readonly PlacedCell[],
  date1904: boolean,
  budget: ByteBudget,
): string {
  const file = new TextFile(budget);
  addHeader(file, sheet, placed.length);
  file.add();
  if (placed.length === 0) file.add('No values.');
  for (const { row, fields } of rowsOf(placed, date1904)) {
    file.addWrapped(`R${String(row)} | `, fields, ' | ');
  }
  return file.text();
}

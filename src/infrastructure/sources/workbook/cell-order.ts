import { columnName, parseAddress } from './cell-address.js';
import { workbookNotReadable } from './workbook-errors.js';
import type { WorkbookCell } from './workbook-model.js';

// RF-152: the cells of a sheet in reading order (row, then column), each with its address written
// the one canonical way, so the same workbook always renders the same text.

export interface PlacedCell {
  /** The cell with its address canonical (`b2` becomes `B2`). */
  readonly cell: WorkbookCell;
  readonly row: number;
  /** 0-based. */
  readonly column: number;
}

const RANGE = /^([A-Za-z]{1,3}[1-9][0-9]{0,6})(?::([A-Za-z]{1,3}[1-9][0-9]{0,6}))?$/u;

function canonicalAddress(column: number, row: number): string {
  return `${columnName(column)}${String(row)}`;
}

/** The cells in row-major order. A cell with an address outside the sheet cannot come from the reader. */
export function placeCells(cells: readonly WorkbookCell[], part: string): PlacedCell[] {
  const placed = cells.map((cell): PlacedCell => {
    const position = parseAddress(cell.address);
    if (position === undefined) {
      throw workbookNotReadable(part, 'a cell has an address that is outside the sheet');
    }
    const address = canonicalAddress(position.column, position.row);
    return { cell: { ...cell, address }, row: position.row, column: position.column };
  });
  return placed.sort((a, b) => a.row - b.row || a.column - b.column);
}

/** The row and the column (0-based) of a cell reference, or `undefined` when it is not one. */
export function positionOf(address: string): { row: number; column: number } | undefined {
  return parseAddress(address);
}

/** A cell or range reference written one canonical way (upper case), or `undefined` when it is not one. */
export function canonicalRange(range: string): string | undefined {
  const match = RANGE.exec(range);
  if (match?.[1] === undefined) return undefined;
  const first = parseAddress(match[1]);
  const last = match[2] === undefined ? undefined : parseAddress(match[2]);
  if (first === undefined || (match[2] !== undefined && last === undefined)) return undefined;
  const from = canonicalAddress(first.column, first.row);
  return last === undefined ? from : `${from}:${canonicalAddress(last.column, last.row)}`;
}

/** How many cells a canonical range covers, or `undefined` when it is not a range. */
export function rangeCellCount(range: string): number | undefined {
  const [from, to] = range.split(':');
  const first = from === undefined ? undefined : parseAddress(from);
  const last = to === undefined ? first : parseAddress(to);
  if (first === undefined || last === undefined) return undefined;
  const rows = Math.abs(last.row - first.row) + 1;
  const columns = Math.abs(last.column - first.column) + 1;
  return rows * columns;
}

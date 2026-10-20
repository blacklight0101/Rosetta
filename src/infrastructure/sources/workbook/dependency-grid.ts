import { parseAddress } from './cell-address.js';
import type { WorkbookCell, WorkbookSheet } from './workbook-model.js';

// RF-153: the cells of one sheet as numbers, in reading order, with the order by column beside it.
// Two counting sorts (by column, then by row) give the order in time linear in the cells, whatever
// order the file listed them in, so the map never depends on the order of the XML.

/** A position is `column * POSITION + row`: both fit (a row is at most 1,048,576 = 2^20). */
export const POSITION = 2_097_152;

export type Numbers = Int32Array | Float64Array | Uint8Array | readonly number[];

/** A typed array element, 0 outside it (the arrays here are always indexed inside their length). */
export function at(values: Numbers, index: number): number {
  return values[index] ?? 0;
}

export interface SheetGrid {
  readonly count: number;
  /** 0-based columns and 1-based rows, in reading order (row, then column). */
  readonly cols: Int32Array;
  readonly rows: Int32Array;
  readonly cells: readonly WorkbookCell[];
  /** The indices of the cells in column order (column, then row). */
  readonly byColumn: Int32Array;
}

const COLUMN_BUCKETS = 16_384;

function orderBy(keys: Int32Array, order: Int32Array, buckets: number): Int32Array {
  const starts = new Int32Array(buckets + 1);
  for (const index of order) starts[at(keys, index) + 1] = at(starts, at(keys, index) + 1) + 1;
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    starts[bucket + 1] = at(starts, bucket + 1) + at(starts, bucket);
  }
  const sorted = new Int32Array(order.length);
  for (const index of order) {
    const key = at(keys, index);
    sorted[at(starts, key)] = index;
    starts[key] = at(starts, key) + 1;
  }
  return sorted;
}

function identity(count: number): Int32Array {
  const order = new Int32Array(count);
  for (let i = 0; i < count; i += 1) order[i] = i;
  return order;
}

export function buildGrid(sheet: WorkbookSheet): SheetGrid {
  const usable: { cell: WorkbookCell; col: number; row: number }[] = [];
  for (const cell of sheet.cells) {
    const position = parseAddress(cell.address);
    if (position !== undefined) usable.push({ cell, col: position.column, row: position.row });
  }
  const count = usable.length;
  const colOf = Int32Array.from(usable, (u) => u.col);
  const rowOf = Int32Array.from(usable, (u) => u.row - 1);
  const maxRow = rowOf.reduce((max, row) => Math.max(max, row), 0) + 1;
  const byColumnFirst = orderBy(colOf, identity(count), COLUMN_BUCKETS);
  const reading = orderBy(rowOf, byColumnFirst, maxRow);
  const cols = Int32Array.from(reading, (i) => at(colOf, i));
  const rows = Int32Array.from(reading, (i) => at(rowOf, i) + 1);
  const cells = Array.from(reading, (i) => usable[i]?.cell ?? { address: '' });
  const byColumn = orderBy(cols, identity(count), COLUMN_BUCKETS);
  return { count, cols, rows, cells, byColumn };
}

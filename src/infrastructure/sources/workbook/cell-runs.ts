import { columnName } from './cell-address.js';
import { POSITION } from './dependency-grid.js';
import type { RefBox } from './reference-box.js';

// RF-153: cells written as ranges. Positions (`column * POSITION + row`) are grouped into vertical
// runs, and neighbouring columns with the same run become one rectangle, so a table of inputs is a
// few ranges and not one line per cell. The order is by first column, then first row.

interface Rect {
  readonly c1: number;
  c2: number;
  readonly r1: number;
  readonly r2: number;
}

function runsOf(sorted: Float64Array): { col: number; r1: number; r2: number }[] {
  const runs: { col: number; r1: number; r2: number }[] = [];
  let last: { col: number; r1: number; r2: number } | undefined;
  for (const position of sorted) {
    const col = Math.floor(position / POSITION);
    const row = position - col * POSITION;
    if (last?.col === col && last.r2 === row - 1) last.r2 = row;
    else if (last?.col === col && last.r2 === row) continue;
    else {
      last = { col, r1: row, r2: row };
      runs.push(last);
    }
  }
  return runs;
}

function rectsOf(sorted: Float64Array): Rect[] {
  const rects: Rect[] = [];
  let open = new Map<string, Rect>();
  let next = new Map<string, Rect>();
  let column = -1;
  for (const run of runsOf(sorted)) {
    if (run.col !== column) {
      open = column === run.col - 1 ? next : new Map<string, Rect>();
      next = new Map<string, Rect>();
      column = run.col;
    }
    const key = `${String(run.r1)}:${String(run.r2)}`;
    const found = open.get(key);
    const rect = found ?? { c1: run.col, c2: run.col, r1: run.r1, r2: run.r2 };
    if (found === undefined) rects.push(rect);
    else rect.c2 = run.col;
    next.set(key, rect);
  }
  return rects;
}

function cellText(col: number, row: number): string {
  return `${columnName(col)}${String(row)}`;
}

/** The ranges of a set of cells (`B2:C3`, `A1`), in a stable order; the positions may be in any order. */
export function rangesOf(positions: readonly number[] | Float64Array): string[] {
  const sorted = Float64Array.from(positions).sort();
  return rectsOf(sorted).map((rect) =>
    rect.c1 === rect.c2 && rect.r1 === rect.r2
      ? cellText(rect.c1, rect.r1)
      : `${cellText(rect.c1, rect.r1)}:${cellText(rect.c2, rect.r2)}`,
  );
}

/** A box written as cells: `C4`, `C4:C9`, `A1:XFD1048576`. */
export function boxText(box: RefBox): string {
  const from = cellText(box.c1, box.r1);
  return box.c1 === box.c2 && box.r1 === box.r2 ? from : `${from}:${cellText(box.c2, box.r2)}`;
}

import { MAX_COLUMNS, MAX_ROWS } from './cell-address.js';

// RF-153: a reference to cells as numbers. A range is four numbers whatever its size: the map never
// expands `A:A` or `A1:XFD1048576` into cells, it keeps the box and asks questions of it.

const LAST_COLUMN = MAX_COLUMNS - 1;
const LAST_ROW = MAX_ROWS;

/** Which corners are written with a `$`, so a shared formula can move the ones that are not. */
export const FIXED_C1 = 1;
export const FIXED_R1 = 2;
export const FIXED_C2 = 4;
export const FIXED_R2 = 8;
const FIXED_ROWS = FIXED_R1 | FIXED_R2;
const FIXED_COLUMNS = FIXED_C1 | FIXED_C2;

/** Columns are 0-based (`A` is 0), rows are 1-based; `c1 <= c2` and `r1 <= r2`. */
export interface RefBox {
  readonly c1: number;
  readonly r1: number;
  readonly c2: number;
  readonly r2: number;
  /** A bit mask of the `FIXED_*` corners. */
  readonly fixed: number;
}

export interface Endpoint {
  readonly col: number;
  readonly row: number;
  readonly fixedCol: boolean;
  readonly fixedRow: boolean;
}

const CELL = /^(\$?)([A-Za-z]{1,3})(\$?)([1-9][0-9]{0,6})$/u;
const COLUMN = /^(\$?)([A-Za-z]{1,3})$/u;
const ROW = /^(\$?)([1-9][0-9]{0,6})$/u;

/** The 0-based column of 1 to 3 letters, or -1 when it is past XFD. */
function columnIndex(letters: string): number {
  let column = 0;
  for (const char of letters.toUpperCase()) column = column * 26 + (char.charCodeAt(0) - 64);
  return column > MAX_COLUMNS ? -1 : column - 1;
}

export function cellEndpoint(word: string): Endpoint | undefined {
  const match = CELL.exec(word);
  if (match?.[2] === undefined || match[4] === undefined) return undefined;
  const col = columnIndex(match[2]);
  const row = Number(match[4]);
  if (col < 0 || row > LAST_ROW) return undefined;
  return { col, row, fixedCol: match[1] === '$', fixedRow: match[3] === '$' };
}

export function columnEndpoint(word: string): Endpoint | undefined {
  const match = COLUMN.exec(word);
  const col = match?.[2] === undefined ? -1 : columnIndex(match[2]);
  return col < 0 ? undefined : { col, row: 1, fixedCol: match?.[1] === '$', fixedRow: true };
}

export function rowEndpoint(word: string): Endpoint | undefined {
  const match = ROW.exec(word);
  const row = match?.[2] === undefined ? 0 : Number(match[2]);
  if (row < 1 || row > LAST_ROW) return undefined;
  return { col: 0, row, fixedCol: true, fixedRow: match?.[1] === '$' };
}

function bit(on: boolean, mask: number): number {
  return on ? mask : 0;
}

/** The box of two corners given in any order. */
export function boxOfCells(a: Endpoint, b: Endpoint = a): RefBox {
  const [lowC, highC] = a.col <= b.col ? [a, b] : [b, a];
  const [lowR, highR] = a.row <= b.row ? [a, b] : [b, a];
  const fixed =
    bit(lowC.fixedCol, FIXED_C1) |
    bit(lowR.fixedRow, FIXED_R1) |
    bit(highC.fixedCol, FIXED_C2) |
    bit(highR.fixedRow, FIXED_R2);
  return { c1: lowC.col, r1: lowR.row, c2: highC.col, r2: highR.row, fixed };
}

/** `A:C`: every row of the columns, kept as one box. */
export function boxOfColumns(a: Endpoint, b: Endpoint): RefBox {
  const box = boxOfCells(a, b);
  return { ...box, r1: 1, r2: LAST_ROW, fixed: (box.fixed & FIXED_COLUMNS) | FIXED_ROWS };
}

/** `1:3`: every column of the rows, kept as one box. */
export function boxOfRows(a: Endpoint, b: Endpoint): RefBox {
  const box = boxOfCells(a, b);
  return { ...box, c1: 0, c2: LAST_COLUMN, fixed: (box.fixed & FIXED_ROWS) | FIXED_COLUMNS };
}

function wrap(value: number, delta: number, size: number): number {
  return (((value + delta) % size) + size) % size;
}

/** The box of a shared formula's dependent cell: the corners without a `$` move by the offset. */
export function shiftBox(box: RefBox, columns: number, rows: number): RefBox {
  if ((columns === 0 && rows === 0) || box.fixed === (FIXED_COLUMNS | FIXED_ROWS)) return box;
  const col = (value: number, mask: number): number =>
    (box.fixed & mask) === 0 ? wrap(value, columns, MAX_COLUMNS) : value;
  const row = (value: number, mask: number): number =>
    (box.fixed & mask) === 0 ? wrap(value - 1, rows, MAX_ROWS) + 1 : value;
  const corners = {
    c1: col(box.c1, FIXED_C1),
    c2: col(box.c2, FIXED_C2),
    r1: row(box.r1, FIXED_R1),
    r2: row(box.r2, FIXED_R2),
  };
  return boxOfCorners(corners, box.fixed);
}

function boxOfCorners(
  corners: { c1: number; c2: number; r1: number; r2: number },
  fixed: number,
): RefBox {
  const swapColumns = corners.c1 > corners.c2;
  const swapRows = corners.r1 > corners.r2;
  let mask = fixed;
  if (swapColumns) mask = swapBits(mask, FIXED_C1, FIXED_C2);
  if (swapRows) mask = swapBits(mask, FIXED_R1, FIXED_R2);
  return {
    c1: swapColumns ? corners.c2 : corners.c1,
    c2: swapColumns ? corners.c1 : corners.c2,
    r1: swapRows ? corners.r2 : corners.r1,
    r2: swapRows ? corners.r1 : corners.r2,
    fixed: mask,
  };
}

function swapBits(mask: number, a: number, b: number): number {
  const rest = mask & ~(a | b);
  return rest | bit((mask & a) !== 0, b) | bit((mask & b) !== 0, a);
}

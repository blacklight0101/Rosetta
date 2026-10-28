import { at } from './dependency-grid.js';
import type { Project } from './dependency-project.js';
import type { RefStore } from './dependency-store.js';
import { MAX_COLUMNS } from './cell-address.js';

// RF-153: which cells of each sheet some formula reads. A formula reads boxes, never cells, and a box
// can cover millions of them, so the answer is a sweep: the boxes of a sheet enter and leave in row
// order while the cells are visited in row order, and a tree over the columns says whether a column is
// inside a box that is open. Cost: (boxes + cells) * log(columns).

/** Boxes of one sheet are numbered in 24 bits in the sort keys below. */
const INDEX_SHIFT = 16_777_216;

/** Counts over the columns that a range can add to and a column can read. */
class ColumnTree {
  private readonly tree = new Int32Array(MAX_COLUMNS + 2);

  add(first: number, last: number, amount: number): void {
    this.bump(first, amount);
    this.bump(last + 1, -amount);
  }

  at(column: number): number {
    let sum = 0;
    for (let i = column + 1; i > 0; i -= i & -i) sum += at(this.tree, i);
    return sum;
  }

  private bump(column: number, amount: number): void {
    for (let i = column + 1; i <= MAX_COLUMNS + 1; i += i & -i) {
      this.tree[i] = at(this.tree, i) + amount;
    }
  }
}

/** The store indices that read each sheet, grouped by sheet. */
function groupBySheet(store: RefStore, sheets: number): { order: Int32Array; starts: Int32Array } {
  const starts = new Int32Array(sheets + 1);
  for (let i = 0; i < store.size; i += 1)
    starts[store.sheetAt(i) + 1] = at(starts, store.sheetAt(i) + 1) + 1;
  for (let s = 0; s < sheets; s += 1) starts[s + 1] = at(starts, s + 1) + at(starts, s);
  const next = Int32Array.from(starts);
  const order = new Int32Array(store.size);
  for (let i = 0; i < store.size; i += 1) {
    const sheet = store.sheetAt(i);
    order[at(next, sheet)] = i;
    next[sheet] = at(next, sheet) + 1;
  }
  return { order, starts };
}

interface Boxes {
  readonly c1: Int32Array;
  readonly c2: Int32Array;
  readonly r1: Int32Array;
  readonly r2: Int32Array;
}

function boxesOf(store: RefStore, indices: Int32Array): Boxes {
  const boxes = {
    c1: new Int32Array(indices.length),
    c2: new Int32Array(indices.length),
    r1: new Int32Array(indices.length),
    r2: new Int32Array(indices.length),
  };
  indices.forEach((index, i) => {
    const box = store.boxAt(index);
    boxes.c1[i] = box.c1;
    boxes.c2[i] = box.c2;
    boxes.r1[i] = box.r1;
    boxes.r2[i] = box.r2;
  });
  return boxes;
}

/** A sorted event list: the row of each box (opening or closing) and the box, packed into one number. */
function eventsOf(rows: Int32Array): Float64Array {
  return Float64Array.from(rows, (row, i) => row * INDEX_SHIFT + i).sort();
}

const rowOf = (event: number): number => Math.floor(event / INDEX_SHIFT);
const boxOf = (event: number): number => event - rowOf(event) * INDEX_SHIFT;

/** For one sheet: 1 for every cell (in reading order) inside a box some formula reads. */
function coverSheet(
  store: RefStore,
  indices: Int32Array,
  cells: { rows: Int32Array; cols: Int32Array },
): Uint8Array {
  const covered = new Uint8Array(cells.rows.length);
  if (indices.length === 0) return covered;
  const boxes = boxesOf(store, indices);
  const opening = eventsOf(boxes.r1);
  const closing = eventsOf(boxes.r2);
  const tree = new ColumnTree();
  let opened = 0;
  let closed = 0;
  for (let k = 0; k < cells.rows.length; k += 1) {
    const row = at(cells.rows, k);
    for (; opened < opening.length && rowOf(at(opening, opened)) <= row; opened += 1) {
      const box = boxOf(at(opening, opened));
      tree.add(at(boxes.c1, box), at(boxes.c2, box), 1);
    }
    for (; closed < closing.length && rowOf(at(closing, closed)) < row; closed += 1) {
      const box = boxOf(at(closing, closed));
      tree.add(at(boxes.c1, box), at(boxes.c2, box), -1);
    }
    covered[k] = tree.at(at(cells.cols, k)) > 0 ? 1 : 0;
  }
  return covered;
}

/** For each sheet (by id), 1 for the cells some formula reads, in the reading order of its grid. */
/** The covering pass, handing the server back after each sheet (RF-159). */
export function* coverageSteps(
  project: Project,
  store: RefStore,
): Generator<void, Uint8Array[], undefined> {
  const { order, starts } = groupBySheet(store, project.sheets.length);
  const covered: Uint8Array[] = [];
  for (const sheet of project.sheets) {
    const refs = order.subarray(at(starts, sheet.id), at(starts, sheet.id + 1));
    covered.push(coverSheet(store, refs, sheet.grid));
    yield;
  }
  return covered;
}

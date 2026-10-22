import { relativeForm } from '../../../domain/planning/formula-text.js';
import type { PlacedCell } from './cell-order.js';

// RF-152, P3-103: the cells of a region that hold the same formula, shifted by their row. Excel
// stores a filled-down column as one formula per cell; `formulas.md` writes each such group once,
// with the cells it fills, and a few example cells. The test of "the same" is the one the plan uses
// to read the file back (`relativeForm`), so what is written once here is one formula there.

/** The runs of rows past which a group lists no more ranges and counts the rest. */
const MAX_RUNS = 12;

/** The example cells after the first one. */
const EXAMPLES = 2;

/** The fewest cells a group needs to be folded: with fewer, the first cell and its examples are all of them. */
export const MIN_FOLD = EXAMPLES + 2;

export interface FillGroup {
  /** The first cell with this formula, in column order: the one whose text is written. */
  readonly first: PlacedCell;
  readonly cells: readonly PlacedCell[];
}

function keyOf(placed: PlacedCell): string {
  const text = placed.cell.formula?.text ?? '';
  // A formula whose text is not in the file has nothing to compare: it stays on its own.
  return text === '' ? `\u0000${placed.cell.address}` : relativeForm(text, placed.row);
}

/** The cells of a run grouped by formula, once each, in order of first sight. */
export function fillGroups(run: readonly PlacedCell[]): FillGroup[] {
  const groups = new Map<string, PlacedCell[]>();
  for (const placed of run) {
    const key = keyOf(placed);
    const found = groups.get(key) ?? [];
    found.push(placed);
    groups.set(key, found);
  }
  return [...groups.values()].flatMap((cells) => {
    const [first] = cells;
    return first === undefined ? [] : [{ first, cells }];
  });
}

/** `B2:B9, B11:B20`: the cells of a group as runs of consecutive rows; the rest of a long list counted. */
export function rangesText(cells: readonly PlacedCell[]): string {
  const runs: PlacedCell[][] = [];
  for (const placed of cells) {
    const last = runs.at(-1);
    if (last?.at(-1)?.row === placed.row - 1) last.push(placed);
    else runs.push([placed]);
  }
  const text = runs.slice(0, MAX_RUNS).map((run) => {
    const from = run[0]?.cell.address ?? '';
    const to = run.at(-1)?.cell.address ?? '';
    return from === to ? from : `${from}:${to}`;
  });
  const more = runs.length - MAX_RUNS;
  if (more > 0) text.push(`... ${String(more)} more run${more === 1 ? '' : 's'}`);
  return text.join(', ');
}

/** The cells shown as examples besides the first: the next two, so no fewer than the three cached results a reader gets. */
export function exampleCells(cells: readonly PlacedCell[]): PlacedCell[] {
  return cells.slice(1, 1 + EXAMPLES);
}

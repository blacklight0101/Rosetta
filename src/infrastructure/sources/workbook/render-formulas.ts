import { bareValue } from './cell-value-text.js';
import { canonicalRange, rangeCellCount, type PlacedCell } from './cell-order.js';
import { TextFile, type ByteBudget } from './render-output.js';
import type { WorkbookCell, WorkbookSheet } from './workbook-model.js';
import { escapeInline, NAME_CAP, quoteText } from './workbook-text.js';

// RF-152, Q-36, RFC-005 section 4.4: `formulas.md`. One line per formula cell, the address first,
// grouped in regions: a run of formulas down one column is a region, a shared formula (Excel's
// fill-down form) is one line for its whole range, written for its first cell, and an array formula
// is one line for its range, marked. The text of a formula is cut at FORMULA_CAP and its cached
// result at CACHED_CAP, so a line stays under the limit of RF-146.

const FORMULA_CAP = 1500;
const CACHED_CAP = 200;

interface Sections {
  /** Vertical runs of two or more formulas, in column order. */
  regions: PlacedCell[][];
  singles: PlacedCell[];
  shared: PlacedCell[];
  arrays: PlacedCell[];
  tables: PlacedCell[];
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function runsOf(cells: readonly PlacedCell[]): PlacedCell[][] {
  const byColumn = [...cells].sort((a, b) => a.column - b.column || a.row - b.row);
  const runs: PlacedCell[][] = [];
  let run: PlacedCell[] = [];
  for (const placed of byColumn) {
    const last = run.at(-1);
    if (last?.column === placed.column && last.row + 1 === placed.row) {
      run.push(placed);
    } else {
      run = [placed];
      runs.push(run);
    }
  }
  return runs;
}

type Placement = 'array' | 'table' | 'shared' | 'covered' | 'plain';

/** Where a formula cell goes. A cell that reuses a shared formula is covered by the line of its first cell. */
function placementOf(cell: WorkbookCell, masters: ReadonlySet<number>): Placement {
  const formula = cell.formula;
  if (formula?.kind === 'array') return 'array';
  if (formula?.kind === 'dataTable') return 'table';
  if (formula?.kind !== 'shared') return 'plain';
  if (formula.text !== '') return 'shared';
  return formula.sharedIndex !== undefined && masters.has(formula.sharedIndex)
    ? 'covered'
    : 'plain';
}

function sectionsOf(placed: readonly PlacedCell[]): Sections {
  const formulas = placed.filter((p) => p.cell.formula !== undefined);
  const masters = new Set<number>();
  for (const { cell } of formulas) {
    const formula = cell.formula;
    if (formula?.kind === 'shared' && formula.text !== '' && formula.sharedIndex !== undefined) {
      masters.add(formula.sharedIndex);
    }
  }
  const sections: Sections = { regions: [], singles: [], shared: [], arrays: [], tables: [] };
  const plain: PlacedCell[] = [];
  const targets: Record<Placement, PlacedCell[]> = {
    array: sections.arrays,
    table: sections.tables,
    shared: sections.shared,
    covered: [],
    plain,
  };
  for (const item of formulas) targets[placementOf(item.cell, masters)].push(item);
  for (const run of runsOf(plain)) {
    if (run.length > 1) sections.regions.push(run);
    else sections.singles.push(...run);
  }
  return sections;
}

function formulaText(cell: WorkbookCell): string {
  const formula = cell.formula;
  if (formula === undefined) return '';
  if (formula.text !== '') return escapeInline(formula.text, FORMULA_CAP);
  if (formula.kind !== 'shared') return '(no formula text)';
  const index = formula.sharedIndex === undefined ? '' : ` ${String(formula.sharedIndex)}`;
  return `(shared formula${index}, its text is not in the file)`;
}

function cachedNote(cell: WorkbookCell, date1904: boolean, label: string): string {
  const value = bareValue(cell, date1904, CACHED_CAP);
  return value === undefined ? '' : `; cached ${label}${value}`;
}

function normalLine(cell: WorkbookCell, date1904: boolean): string {
  const value = bareValue(cell, date1904, CACHED_CAP);
  const note = value === undefined ? 'no cached value' : `cached: ${value}`;
  return `${cell.address} = ${formulaText(cell)}    [${note}]`;
}

function rangeOf(cell: WorkbookCell): string {
  const range = cell.formula?.range;
  return (range === undefined ? undefined : canonicalRange(range)) ?? cell.address;
}

function addRegion(file: TextFile, run: readonly PlacedCell[], date1904: boolean): void {
  const first = run[0]?.cell.address ?? '';
  const last = run.at(-1)?.cell.address ?? '';
  file.section(`## Region ${first}:${last} (${plural(run.length, 'formula')})`);
  for (const { cell } of run) file.add(normalLine(cell, date1904));
}

function addShared(file: TextFile, items: readonly PlacedCell[], date1904: boolean): void {
  for (const { cell } of items) {
    const range = rangeOf(cell);
    const count = rangeCellCount(range);
    const size = count === undefined ? '' : `, ${String(count)} cells`;
    file.section(`## Region ${range} (shared formula${size})`);
    const note = cachedNote(cell, date1904, `${cell.address}: `);
    file.add(`${range} = ${formulaText(cell)}    [written for ${cell.address}${note}]`);
  }
}

function addMarked(
  file: TextFile,
  heading: string,
  items: readonly PlacedCell[],
  date1904: boolean,
): void {
  if (items.length === 0) return;
  file.section(heading);
  for (const { cell } of items) {
    const kind = cell.formula?.kind === 'array' ? 'array' : 'data table';
    const body = cell.formula?.kind === 'array' ? `{= ${formulaText(cell)}}` : '{data table}';
    const note = cachedNote(cell, date1904, `${cell.address}: `);
    file.add(`${rangeOf(cell)} ${body}    [${kind}${note}]`);
  }
}

export function renderFormulas(
  sheet: WorkbookSheet,
  placed: readonly PlacedCell[],
  date1904: boolean,
  budget: ByteBudget,
): string {
  const file = new TextFile(budget);
  const sections = sectionsOf(placed);
  const count = placed.filter((p) => p.cell.formula !== undefined).length;
  file.add(`# Formulas of sheet ${quoteText(sheet.name, NAME_CAP)}`);
  file.add(`- Formula cells: ${String(count)}`);
  if (count === 0) {
    file.add();
    file.add('No formulas.');
    return file.text();
  }
  for (const run of sections.regions) addRegion(file, run, date1904);
  if (sections.singles.length > 0) {
    file.section(`## Single cells (${plural(sections.singles.length, 'formula')})`);
    for (const { cell } of sections.singles) file.add(normalLine(cell, date1904));
  }
  addShared(file, sections.shared, date1904);
  addMarked(file, '## Array formulas', sections.arrays, date1904);
  addMarked(file, '## Data tables', sections.tables, date1904);
  return file.text();
}

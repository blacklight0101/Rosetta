import { valueParts } from './cell-value-text.js';
import {
  rangeColumn,
  tableColumnText,
  tableLocator,
  type ColumnLocator,
  type TableColumn,
} from './formula-tables.js';
import { MIN_FOLD, fillGroups, exampleCells, rangesText, type FillGroup } from './formula-fill.js';
import { canonicalRange, rangeCellCount, type PlacedCell } from './cell-order.js';
import { TextFile, type ByteBudget } from './render-output.js';
import type { WorkbookCell, WorkbookSheet } from './workbook-model.js';
import { NAME_CAP, quoteText, splitText } from './workbook-text.js';

// RF-152, Q-36, RFC-005 section 4.4: `formulas.md`. One line per formula cell, the address first,
// grouped in regions: a run of formulas down one column is a region, a shared formula (Excel's
// fill-down form) is one line for its whole range, written for its first cell, and an array formula
// is one line for its range, marked. Inside a run, the cells that hold the same formula, shifted by
// their row, are one line (P3-103): the formula of the first, the cells it fills and a few examples. A long formula, or a long cached text, goes on
// continuation lines that start with the same address, so no line passes RF-146 and nothing is cut.

const FORMULA_CHUNK = 800;
const CACHED_CHUNK = 600;

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

function sameTable(locate: ColumnLocator, a: PlacedCell, b: PlacedCell): boolean {
  const [first, second] = [locate(a.column, a.row), locate(b.column, b.row)];
  return first?.table === second?.table;
}

function runsOf(cells: readonly PlacedCell[], locate: ColumnLocator): PlacedCell[][] {
  const byColumn = [...cells].sort((a, b) => a.column - b.column || a.row - b.row);
  const runs: PlacedCell[][] = [];
  let run: PlacedCell[] = [];
  for (const placed of byColumn) {
    const last = run.at(-1);
    if (
      last?.column === placed.column &&
      last.row + 1 === placed.row &&
      sameTable(locate, last, placed)
    ) {
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

function sectionsOf(placed: readonly PlacedCell[], locate: ColumnLocator): Sections {
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
  for (const run of runsOf(plain, locate)) {
    if (run.length > 1) sections.regions.push(run);
    else sections.singles.push(...run);
  }
  return sections;
}

function formulaChunks(cell: WorkbookCell): string[] {
  const formula = cell.formula;
  if (formula === undefined) return [''];
  if (formula.text !== '') return splitText(formula.text, FORMULA_CHUNK, false);
  if (formula.kind !== 'shared') return ['(no formula text)'];
  const index = formula.sharedIndex === undefined ? '' : ` ${String(formula.sharedIndex)}`;
  return [`(shared formula${index}, its text is not in the file)`];
}

interface LineSpec {
  /** Starts the first line: `B12 = `, `D2:D4001 = `, `F2:F9 {= `. */
  readonly head: string;
  /** Ends the last line of the formula text: `}` for an array. */
  readonly tail: string;
  /** What the note says before the cached value: `array`, `written for D2`; none for a plain formula. */
  readonly kind?: string;
  /** Names the cell of the cached value in the note (`D2`); empty for a plain formula. */
  readonly label: string;
}

function noteOf(spec: LineSpec, cached: string | undefined): string {
  const phrase =
    cached === undefined
      ? undefined
      : `cached${spec.label === '' ? '' : ` ${spec.label}`}: ${cached}`;
  const parts = [spec.kind, phrase].filter((part): part is string => part !== undefined);
  return parts.length === 0 ? 'no cached value' : parts.join('; ');
}

/**
 * One formula: the text on as many lines as it needs (the later ones start with the cell address),
 * the note on the last, and the rest of a long cached text on lines of its own.
 */
function addFormula(file: TextFile, cell: WorkbookCell, spec: LineSpec, date1904: boolean): void {
  const chunks = formulaChunks(cell);
  const cached = valueParts(cell, date1904, CACHED_CHUNK);
  const last = chunks.length - 1;
  chunks.forEach((chunk, index) => {
    const start = index === 0 ? spec.head : `${cell.address} (continued) `;
    const end = index === last ? `${spec.tail}    [${noteOf(spec, cached?.[0])}]` : '';
    file.add(`${start}${chunk}${end}`);
  });
  for (const piece of cached?.slice(1) ?? [])
    file.add(`${cell.address} (cached, continued) ${piece}`);
}

function rangeOf(cell: WorkbookCell): string {
  const range = cell.formula?.range;
  return (range === undefined ? undefined : canonicalRange(range)) ?? cell.address;
}

/** What the writing of a sheet needs besides the file: the date system and where tables are. */
interface Sheet {
  readonly date1904: boolean;
  readonly locate: ColumnLocator;
}

/** `, InvoiceTable column "Total"` for a cell or range in a table column; nothing outside one. */
function tableSuffix(at: TableColumn | undefined): string {
  return at === undefined ? '' : `, ${tableColumnText(at)}`;
}

/** One example cell after a folded formula: `B251 (example) 2510`; none when the cell has no cached value or a long one. */
function addExample(file: TextFile, placed: PlacedCell, date1904: boolean): void {
  const parts = valueParts(placed.cell, date1904, CACHED_CHUNK);
  const [piece] = parts ?? [];
  if (parts?.length === 1 && piece !== undefined)
    file.add(`${placed.cell.address} (example) ${piece}`);
}

/** A group of fewer than four cells is written cell by cell; a larger group once, with the cells it fills. */
function addGroup(file: TextFile, group: FillGroup, date1904: boolean): void {
  const { first, cells } = group;
  const head = `${first.cell.address} = `;
  if (cells.length < MIN_FOLD) {
    for (const { cell } of cells) {
      addFormula(file, cell, { head: `${cell.address} = `, tail: '', label: '' }, date1904);
    }
    return;
  }
  const kind = `${String(cells.length)} cells: ${rangesText(cells)}`;
  addFormula(file, first.cell, { head, tail: '', kind, label: first.cell.address }, date1904);
  for (const example of exampleCells(cells)) addExample(file, example, date1904);
}

function addRegion(file: TextFile, run: readonly PlacedCell[], sheet: Sheet): void {
  const first = run[0]?.cell.address ?? '';
  const last = run.at(-1)?.cell.address ?? '';
  const where = run[0] === undefined ? undefined : sheet.locate(run[0].column, run[0].row);
  file.section(
    `## Region ${first}:${last} (${plural(run.length, 'formula')})${tableSuffix(where)}`,
  );
  for (const group of fillGroups(run)) addGroup(file, group, sheet.date1904);
}

function addSingles(file: TextFile, singles: readonly PlacedCell[], sheet: Sheet): void {
  if (singles.length === 0) return;
  file.section(`## Single cells (${plural(singles.length, 'formula')})`);
  for (const { cell, column, row } of singles) {
    const where = sheet.locate(column, row);
    const kind = where === undefined ? {} : { kind: tableColumnText(where) };
    addFormula(
      file,
      cell,
      { head: `${cell.address} = `, tail: '', label: '', ...kind },
      sheet.date1904,
    );
  }
}

function addShared(file: TextFile, items: readonly PlacedCell[], sheet: Sheet): void {
  for (const { cell } of items) {
    const range = rangeOf(cell);
    const count = rangeCellCount(range);
    const size = count === undefined ? '' : `, ${String(count)} cells`;
    const where = tableSuffix(rangeColumn(sheet.locate, range));
    file.section(`## Region ${range} (shared formula${size})${where}`);
    const spec = {
      head: `${range} = `,
      tail: '',
      kind: `written for ${cell.address}`,
      label: cell.address,
    };
    addFormula(file, cell, spec, sheet.date1904);
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
    const array = cell.formula?.kind === 'array';
    const head = array ? `${rangeOf(cell)} {= ` : `${rangeOf(cell)} {data table`;
    const spec = { head, tail: '}', kind: array ? 'array' : 'data table', label: cell.address };
    addFormula(file, cell, spec, date1904);
  }
}

export function renderFormulas(
  sheet: WorkbookSheet,
  placed: readonly PlacedCell[],
  date1904: boolean,
  budget: ByteBudget,
): string {
  const file = new TextFile(budget);
  const locate = tableLocator(sheet.tables);
  const sections = sectionsOf(placed, locate);
  const count = placed.filter((p) => p.cell.formula !== undefined).length;
  file.add(`# Formulas of sheet ${quoteText(sheet.name, NAME_CAP)}`);
  file.add(`- Formula cells: ${String(count)}`);
  if (count === 0) {
    file.add();
    file.add('No formulas.');
    return file.text();
  }
  const written = { date1904, locate };
  for (const run of sections.regions) addRegion(file, run, written);
  addSingles(file, sections.singles, written);
  addShared(file, sections.shared, written);
  addMarked(file, '## Array formulas', sections.arrays, date1904);
  addMarked(file, '## Data tables', sections.tables, date1904);
  return file.text();
}

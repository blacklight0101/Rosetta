import type { Citation } from '../cards/citation.js';
import { parseFormulaFile, type RawCell, type RawSection } from './formula-file.js';
import type { TableColumnName } from './formula-note.js';
import { cellOf, columnNamesOf, relativeForm } from './formula-text.js';

// RF-152, RF-155, RF-623, RFC-005 section 4.7, ADR-013, P3-94: the formulas of the workbooks a plan
// is made from, read by code out of the rendered `formulas.md` of each sheet, never by a model.
// Each formula is one row, whatever the number of cells it fills.

/** One cached result: the cell, and its text or its number, date, boolean or error as stored. */
export interface FormulaValue {
  readonly address: string;
  /** `text` is a cell's text (it can hold anything, so it is masked); `plain` is a number, date, boolean or error. */
  readonly kind: 'text' | 'plain';
  readonly text: string;
}

export interface FormulaRow {
  /** `F-001`, in the order of the files. */
  readonly id: string;
  /** The folder of the workbook in the snapshot: `Invoice.xlsm`. */
  readonly workbook: string;
  readonly sheet: string;
  /** The folder of the sheet in the snapshot: `Invoice.xlsm/Invoice`. */
  readonly folder: string;
  readonly shape: 'region' | 'single' | 'shared' | 'array';
  /** `G8:G12`, or `A2:A3, A5` for a formula that fills two runs of cells. */
  readonly range: string;
  readonly cells: number;
  /** The table and column the formula fills, when the rendered file names them. */
  readonly table?: string;
  readonly column?: string;
  /** The formula text of the first cell, structured references written as column names. */
  readonly formula: string;
  /** Up to three cached results. */
  readonly cached: readonly FormulaValue[];
  /** The rendered lines that hold the formula. */
  readonly source: Citation;
}

export interface WorkbookFormulas {
  readonly rows: readonly FormulaRow[];
  /** Formulas left out because the rows passed the limit. */
  readonly omitted: number;
  /** Rendered `formulas.md` files that could not be read. */
  readonly unread: number;
}

export interface FormulaFile {
  /** Path in the snapshot: `Invoice.xlsm/Invoice/formulas.md`. */
  readonly path: string;
  readonly text: string;
}

export interface FormulaOptions {
  readonly unread: number;
  /** The most rows kept; `DEFAULT_MAX_ROWS` when absent. */
  readonly maxRows?: number;
}

/** The most rows a package lists; the formulas past it are counted, not listed. */
export const DEFAULT_MAX_ROWS = 2000;
/** The cached results one row shows. */
const CACHED_SHOWN = 3;

type RowWithoutId = Omit<FormulaRow, 'id'>;

interface Place {
  readonly workbook: string;
  readonly sheet: string;
  readonly folder: string;
  readonly path: string;
}

function placeOf(path: string, sheet: string | undefined): Place {
  const folder = path.replace(/\/?[^/]*$/u, '');
  const parent = folder.replace(/\/?[^/]*$/u, '');
  return {
    ...{ workbook: parent === '' ? folder : parent, folder, path },
    sheet: sheet ?? folder.replace(/^.*\//u, ''),
  };
}

/** How many cells a range of one or two corners covers; 1 when it cannot be read. */
function cellsOf(range: string): number {
  const [from, to = from] = range.split(':');
  const first = cellOf(from ?? '');
  const last = cellOf(to ?? '');
  if (first === undefined || last === undefined) return 1;
  return (Math.abs(last.row - first.row) + 1) * (Math.abs(last.column - first.column) + 1);
}

function valueOfCell(cell: RawCell, address: string): FormulaValue[] {
  const { cached } = cell.note;
  return cached === undefined ? [] : [{ address, ...cached }];
}

function rowOf(
  place: Place,
  parts: Omit<RowWithoutId, 'workbook' | 'sheet' | 'folder'>,
): RowWithoutId {
  const { workbook, sheet, folder } = place;
  return { workbook, sheet, folder, ...parts };
}

function tableOf(table: TableColumnName | undefined): { table?: string; column?: string } {
  return table === undefined ? {} : { table: table.table, column: table.column };
}

/** The first corner of a range: where a shared or array formula's cached result sits. */
function firstCell(range: string): string {
  return range.replace(/:.*$/u, '');
}

function singleRow(place: Place, cell: RawCell): RowWithoutId {
  return rowOf(place, {
    ...{ shape: 'single', range: cell.head, cells: 1, ...tableOf(cell.note.table) },
    formula: columnNamesOf(cell.formula),
    cached: valueOfCell(cell, cell.head),
    source: { path: place.path, startLine: cell.startLine, endLine: cell.endLine },
  });
}

function wholeRow(place: Place, section: RawSection, cell: RawCell): RowWithoutId {
  const shared = section.kind === 'shared';
  const range = shared ? section.range : cell.head;
  const from = shared ? section.headingLine : cell.startLine;
  return rowOf(place, {
    shape: shared ? 'shared' : 'array',
    ...{ range, cells: cellsOf(range), ...tableOf(section.table) },
    formula: columnNamesOf(cell.formula),
    cached: valueOfCell(cell, firstCell(range)),
    source: { path: place.path, startLine: from, endLine: cell.endLine },
  });
}

interface Group {
  /** The first cell with this formula: the one whose text the row shows. */
  readonly first: RawCell;
  readonly letters: string;
  readonly cells: { readonly cell: RawCell; readonly row: number }[];
}

/** The cells of a region grouped by the formula they hold, once each, in order of first sight. */
function groupsOf(section: RawSection): Group[] {
  const groups = new Map<string, Group>();
  for (const cell of section.cells) {
    const at = cellOf(cell.head);
    if (at === undefined) continue;
    const key = relativeForm(cell.formula, at.row);
    const letters = cell.head.replace(/\d+$/u, '');
    const found = groups.get(key) ?? { first: cell, letters, cells: [] };
    found.cells.push({ cell, row: at.row });
    groups.set(key, found);
  }
  return [...groups.values()];
}

/** `A2:A3, A5`: the rows of the cells as runs of consecutive rows in one column. */
function rangesOf(letters: string, rows: readonly number[]): string {
  const runs: [number, number][] = [];
  for (const row of rows) {
    const last = runs.at(-1);
    if (last !== undefined && last[1] + 1 === row) last[1] = row;
    else runs.push([row, row]);
  }
  return runs
    .map(([from, to]) =>
      from === to
        ? `${letters}${String(from)}`
        : `${letters}${String(from)}:${letters}${String(to)}`,
    )
    .join(', ');
}

function regionRows(place: Place, section: RawSection): RowWithoutId[] {
  return groupsOf(section).map(({ first, letters, cells }, index) => {
    const lines = cells.map(({ cell }) => cell);
    const start =
      index === 0 ? section.headingLine : Math.min(...lines.map((cell) => cell.startLine));
    return rowOf(place, {
      shape: 'region',
      range: rangesOf(
        letters,
        cells.map(({ row }) => row),
      ),
      cells: cells.length,
      ...tableOf(section.table),
      formula: columnNamesOf(first.formula),
      cached: lines.flatMap((cell) => valueOfCell(cell, cell.head)).slice(0, CACHED_SHOWN),
      source: {
        path: place.path,
        startLine: start,
        endLine: Math.max(...lines.map((cell) => cell.endLine)),
      },
    });
  });
}

function rowsOfSection(place: Place, section: RawSection): RowWithoutId[] {
  switch (section.kind) {
    case 'region':
      return regionRows(place, section);
    case 'single':
      return section.cells.map((cell) => singleRow(place, cell));
    case 'shared':
    case 'array':
      return section.cells.map((cell) => wholeRow(place, section, cell));
  }
}

/**
 * The formulas of the rendered workbooks from their `formulas.md` files, each formula once, in the
 * order of the files; `options.unread` counts the files the caller could not read.
 */
// RF-152
export function workbookFormulasOf(
  files: readonly FormulaFile[],
  options: FormulaOptions,
): WorkbookFormulas {
  const all = files.flatMap((file) => {
    const parsed = parseFormulaFile(file.text);
    const place = placeOf(file.path, parsed.sheet);
    return parsed.sections.flatMap((section) => rowsOfSection(place, section));
  });
  const kept = all.slice(0, options.maxRows ?? DEFAULT_MAX_ROWS);
  const rows = kept.map((row, index) => ({
    id: `F-${String(index + 1).padStart(3, '0')}`,
    ...row,
  }));
  return { rows, omitted: all.length - kept.length, unread: options.unread };
}

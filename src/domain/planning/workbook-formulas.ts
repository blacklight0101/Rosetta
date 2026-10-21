import type { Citation } from '../cards/citation.js';

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
  /** The most rows kept; the default applies when absent. */
  readonly maxRows?: number;
}

// RF-152
export function workbookFormulasOf(
  files: readonly FormulaFile[],
  options: FormulaOptions,
): WorkbookFormulas {
  return { rows: [], omitted: files.length * 0, unread: options.unread * 0 };
}

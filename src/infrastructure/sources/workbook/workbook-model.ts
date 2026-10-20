// RF-151, RF-152, ADR-023: the typed model the reader returns. It holds what the file says, read
// once: cached values are the ones Excel stored, formulas are text (never evaluated), and the
// renderer (P3-46) turns it into the text snapshot. Authors of comments are never read (Q-39).

import type { MacroProject } from './macro-model.js';

export type CellValue =
  | { readonly type: 'number'; readonly value: number }
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'error'; readonly value: string }
  | { readonly type: 'date'; readonly value: string };

/** `shared`: only the first cell of a range holds the text; the others name its `sharedIndex`. */
export type FormulaKind = 'normal' | 'shared' | 'array' | 'dataTable';

export interface CellFormula {
  readonly kind: FormulaKind;
  /** Empty for a cell that reuses a shared formula. */
  readonly text: string;
  /** The range a shared or array formula covers, where the file names it. */
  readonly range?: string;
  readonly sharedIndex?: number;
}

export interface WorkbookCell {
  readonly address: string;
  /** Absent for a formula the file stored without a result. */
  readonly value?: CellValue;
  /** The number format code; absent for General. */
  readonly numberFormat?: string;
  readonly formula?: CellFormula;
}

export type SheetState = 'visible' | 'hidden' | 'veryHidden';

export interface DataValidationRule {
  readonly ranges: string;
  readonly type: string;
  readonly operator?: string;
  readonly formula1?: string;
  readonly formula2?: string;
}

export interface ConditionalRule {
  readonly ranges: string;
  readonly type: string;
  readonly operator?: string;
  readonly formulas: readonly string[];
}

export interface SheetComment {
  readonly address: string;
  readonly text: string;
}

export interface WorkbookTable {
  readonly name: string;
  readonly range: string;
  readonly columns: readonly string[];
}

export interface PivotTable {
  readonly name: string;
  readonly range?: string;
}

/** Hidden rows or columns as ranges (`2:3`, `5`; `B:C`, `E`); `omitted` counts the ranges past the cap. */
export interface HiddenLines {
  readonly ranges: readonly string[];
  readonly omitted: number;
}

export interface WorkbookSheet {
  readonly name: string;
  readonly state: SheetState;
  /** The package part that holds the sheet. */
  readonly part: string;
  readonly usedRange?: string;
  readonly cells: readonly WorkbookCell[];
  readonly mergedRanges: readonly string[];
  readonly hiddenRows: HiddenLines;
  readonly hiddenColumns: HiddenLines;
  readonly validations: readonly DataValidationRule[];
  readonly conditionalRules: readonly ConditionalRule[];
  readonly comments: readonly SheetComment[];
  readonly tables: readonly WorkbookTable[];
  readonly pivots: readonly PivotTable[];
  /** The kinds of chart on the sheet, one entry per chart (`barChart`, `lineChart`, ...). */
  readonly charts: readonly string[];
}

export interface DefinedName {
  readonly name: string;
  /** The sheet a name is local to; absent for a workbook-wide name. */
  readonly sheet?: string;
  readonly hidden: boolean;
  readonly refersTo: string;
}

export interface ExternalLink {
  /** Only the file name of the target (Q-38); the file is never opened. */
  readonly fileName: string;
}

export interface DataConnection {
  readonly name: string;
  /** The `type` number of the connection; the connection string is never read (Q-34). */
  readonly sourceType?: number;
}

export interface WorkbookModel {
  readonly fileName: string;
  readonly date1904: boolean;
  readonly sheets: readonly WorkbookSheet[];
  readonly definedNames: readonly DefinedName[];
  readonly externalLinks: readonly ExternalLink[];
  readonly connections: readonly DataConnection[];
  /** True when the package holds `xl/vbaProject.bin`. */
  readonly hasMacros: boolean;
  /** The VBA project read from it, as text (RF-154); absent when there is none. */
  readonly macros?: MacroProject;
  readonly sharedStringCount: number;
}

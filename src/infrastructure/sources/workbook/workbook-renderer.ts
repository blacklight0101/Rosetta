import { placeCells } from './cell-order.js';
import { renderFormulas } from './render-formulas.js';
import { renderIndex, type SheetEntry } from './render-index.js';
import { ByteBudget } from './render-output.js';
import { renderNotes, renderValidation } from './render-rules.js';
import { renderValues } from './render-values.js';
import type { WorkbookModel, WorkbookSheet } from './workbook-model.js';
import { allocateSegments } from './workbook-segments.js';
import { capName } from './workbook-text.js';

// RF-152, ADR-005, ADR-023, DEC-150, RFC-005 section 4.4: renders the typed model of each workbook
// into the read-only text snapshot. A workbook becomes a folder named after its file; below it
// `workbook.md` and one folder per sheet with `formulas.md`, `values.md`, `validation.md` and
// `notes.md`. The result is a list of paths and texts, nothing is written to disk here (the upload
// flow of P3-48 writes it). The same models give the same files in the same order, byte for byte.

/**
 * Changes whenever the text a workbook renders to changes, so a snapshot can be told from one made by
 * another renderer (the record of RF-126 keeps it). A newer renderer needs a new upload (Q-37).
 */
export const WORKBOOK_RENDERER_VERSION = '1';

/** The bytes of rendered text one render may produce, for all its workbooks together. */
const DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;

interface RenderedFile {
  /** Below the project root: `Pricing.xlsx/Summary/values.md`. */
  readonly path: string;
  readonly content: string;
}

/** One safe folder or file segment and the real name it stands for (cut to 100 characters). */
interface RenderedName {
  readonly segment: string;
  readonly kind: 'workbook' | 'sheet';
  readonly name: string;
}

export interface RenderedWorkbook {
  /** The folder of the workbook, the first segment of every path. */
  readonly folder: string;
  /** Sorted by path. */
  readonly files: readonly RenderedFile[];
  /** The workbook first, then its sheets in tab order: the table at the top of `workbook.md`. */
  readonly names: readonly RenderedName[];
  readonly counts: {
    readonly sheets: number;
    readonly nonEmptyCells: number;
    readonly formulas: number;
  };
}

export interface RenderLimits {
  /** The bytes of rendered text, over all the workbooks of one call (RST-1926 when passed). */
  readonly maxTotalBytes: number;
}

const DEFAULT_LIMITS: RenderLimits = { maxTotalBytes: DEFAULT_MAX_TOTAL_BYTES };

function renderSheet(
  model: WorkbookModel,
  entry: SheetEntry,
  budget: ByteBudget,
): { files: Record<string, string>; entry: SheetEntry } {
  const { sheet } = entry;
  const placed = placeCells(sheet.cells, sheet.part);
  const formulas = placed.filter((p) => p.cell.formula !== undefined).length;
  const withCount = { ...entry, formulas };
  return {
    entry: withCount,
    files: {
      'values.md': renderValues(sheet, placed, model.date1904, budget),
      'formulas.md': renderFormulas(sheet, placed, model.date1904, budget),
      'validation.md': renderValidation(sheet, budget),
      'notes.md': renderNotes(sheet, budget),
    },
  };
}

function renderOne(model: WorkbookModel, folder: string, budget: ByteBudget): RenderedWorkbook {
  const segments = allocateSegments(
    model.sheets.map((sheet) => sheet.name),
    { reserved: ['workbook.md', 'macros'] },
  );
  const files: RenderedFile[] = [];
  const entries: SheetEntry[] = [];
  model.sheets.forEach((sheet: WorkbookSheet, index) => {
    const segment = segments[index] ?? '_';
    const rendered = renderSheet(model, { sheet, segment, formulas: 0 }, budget);
    entries.push(rendered.entry);
    for (const [name, content] of Object.entries(rendered.files)) {
      files.push({ path: `${folder}/${segment}/${name}`, content });
    }
  });
  const index = renderIndex({ model, folder, entries, version: WORKBOOK_RENDERER_VERSION }, budget);
  files.push({ path: `${folder}/workbook.md`, content: index });
  files.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return {
    folder,
    files,
    names: [
      { segment: folder, kind: 'workbook', name: capName(model.fileName) },
      ...entries.map((e) => ({
        segment: e.segment,
        kind: 'sheet' as const,
        name: capName(e.sheet.name),
      })),
    ],
    counts: {
      sheets: entries.length,
      nonEmptyCells: entries.reduce((sum, e) => sum + e.sheet.cells.length, 0),
      formulas: entries.reduce((sum, e) => sum + e.formulas, 0),
    },
  };
}

/**
 * Renders each workbook into its folder. The folders are safe, distinct segments of the file names;
 * `limits.maxTotalBytes` bounds the text of all of them together (RST-1926 when it is passed).
 */
export function renderWorkbooks(
  models: readonly WorkbookModel[],
  limits: RenderLimits = DEFAULT_LIMITS,
): RenderedWorkbook[] {
  const budget = new ByteBudget(limits.maxTotalBytes);
  const folders = allocateSegments(
    models.map((model) => model.fileName),
    { keepExtension: true },
  );
  return models.map((model, index) => renderOne(model, folders[index] ?? '_', budget));
}

export function renderWorkbook(
  model: WorkbookModel,
  limits: RenderLimits = DEFAULT_LIMITS,
): RenderedWorkbook {
  const [rendered] = renderWorkbooks([model], limits);
  if (rendered === undefined) throw new RangeError('One workbook gives one render.');
  return rendered;
}

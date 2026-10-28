import type { ProgressListener } from '../../../application/ports/workbook-staging.js';
import { placeCells } from './cell-order.js';
import { DEFAULT_DEPENDENCY_LIMITS, type DependencyLimits } from './dependency-limits.js';
import { plainModel } from './external-names.js';
import { renderDependencies } from './render-dependencies.js';
import { renderFormulas } from './render-formulas.js';
import { renderIndex, type SheetEntry } from './render-index.js';
import { macroNoticeOf, renderMacros } from './render-macros.js';
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
export const WORKBOOK_RENDERER_VERSION = '3';

/** The bytes of rendered text one render may produce, for all its workbooks together. */
export const DEFAULT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;

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
    /** Macro modules written as files, and modules listed without a file. */
    readonly macroModules: number;
    readonly macrosSkipped: number;
  };
  /** Set when the macros were skipped because they are locked or compiled only (Q-40). */
  readonly macroNotice?: string;
}

export interface RenderLimits {
  /** The bytes of rendered text, over all the workbooks of one call (RST-1926 when passed). */
  readonly maxTotalBytes: number;
  /** Bounds of the dependency map; the defaults apply to what is left out. */
  readonly dependencies?: Partial<DependencyLimits>;
  /** The folder of each model, in place of the safe segments of their file names (a zip renders in place). */
  readonly folders?: readonly string[];
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
  const macros = renderMacros(model.macros, budget);
  for (const file of macros.files)
    files.push({ path: `${folder}/${file.path}`, content: file.content });
  const notice = macroNoticeOf(model.macros, macros);
  const input = { model, folder, entries, version: WORKBOOK_RENDERER_VERSION, macros };
  files.push({ path: `${folder}/workbook.md`, content: renderIndex(input, budget) });
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
      macroModules: macros.written,
      macrosSkipped: macros.skipped,
    },
    ...(notice === undefined ? {} : { macroNotice: notice }),
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
  return renderAll(models.map(plainModel), new ByteBudget(limits.maxTotalBytes));
}

function renderAll(
  models: readonly WorkbookModel[],
  budget: ByteBudget,
  given?: readonly string[],
): RenderedWorkbook[] {
  const folders =
    given ??
    allocateSegments(
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

export interface RenderedProject {
  readonly workbooks: readonly RenderedWorkbook[];
  /** `dependencies.md`, at the root of the tree (RFC-005 section 4.5). */
  readonly dependencies: RenderedFile;
}

/**
 * Renders the workbooks of a project and the dependency map that spans them. Both draw on one byte
 * limit (`limits.maxTotalBytes`, RST-1926 when it is passed).
 */
export function renderProject(
  models: readonly WorkbookModel[],
  limits: RenderLimits = DEFAULT_LIMITS,
): RenderedProject {
  const budget = new ByteBudget(limits.maxTotalBytes);
  const plain = models.map(plainModel);
  const workbooks = renderAll(plain, budget, limits.folders);
  const bounds = { ...DEFAULT_DEPENDENCY_LIMITS, ...limits.dependencies };
  const content = renderDependencies(models, workbooks, bounds, budget);
  return { workbooks, dependencies: { path: 'dependencies.md', content } };
}

/** Placeholder until the render yields: the synchronous render behind the asynchronous signature. */
export function renderProjectAsync(
  models: readonly WorkbookModel[],
  limits: RenderLimits,
  pacing: { check: () => void; onProgress?: ProgressListener },
): Promise<RenderedProject> {
  pacing.check();
  return Promise.resolve(renderProject(models, limits));
}

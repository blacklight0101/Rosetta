import { rangesOf } from './cell-runs.js';
import { collect, type Collected } from './dependency-collect.js';
import { coverage } from './dependency-cover.js';
import { findCycles, type CycleSearch } from './dependency-cycles.js';
import { at, POSITION } from './dependency-grid.js';
import type { DependencyLimits } from './dependency-limits.js';
import { buildProject, type Project, type RenderedNames } from './dependency-project.js';
import { MAX_REFERENCES_PER_FORMULA } from './formula-references.js';
import { addDefinedNames, addUnresolvedAndDynamic } from './render-dependency-names.js';
import { TextFile, type ByteBudget } from './render-output.js';
import type { WorkbookModel } from './workbook-model.js';

// RF-153, RFC-005 section 4.5: `dependencies.md`, the formula dependency map of the whole project.
// Workbook and sheet edges with the number of formulas, input cells (no formula, read by a formula),
// output cells (a formula nothing reads), defined names, unresolved and dynamic references, circular
// references and the limits that were reached. The order is fixed, so the same project gives the same
// bytes. Nothing is evaluated.

interface Parts {
  readonly project: Project;
  readonly collected: Collected;
  readonly covered: readonly Uint8Array[];
  readonly cycles: CycleSearch;
  readonly limits: DependencyLimits;
}

function plural(count: number, noun: string): string {
  return `${String(count)} ${noun}${count === 1 ? '' : 's'}`;
}

function addHeader(file: TextFile, parts: Parts): void {
  file.add('# Dependencies of the project');
  file.add();
  file.add(`- Workbooks: ${String(parts.project.workbooks.length)}`);
  file.add(`- Sheets: ${String(parts.project.sheets.length)}`);
  file.add(`- Formula cells: ${String(parts.collected.nodeSheet.length)}`);
}

function addWorkbookEdges(file: TextFile, parts: Parts): void {
  const { project, collected } = parts;
  file.section('## Workbooks');
  const books = [...collected.findings.workbookEdges].sort((a, b) => a[0] - b[0]);
  for (const [key, count] of books) {
    const from = project.workbooks[Math.floor(key / 4096)]?.folder ?? '';
    const to = project.workbooks[key % 4096]?.folder ?? '';
    file.add(`${from} -> ${to}: ${plural(count, 'formula')}`);
  }
  if (books.length === 0) file.add('None.');
}

function addSheetEdges(file: TextFile, parts: Parts): void {
  const { project, collected } = parts;
  file.section('## Sheets');
  const size = project.sheets.length;
  const sheets = [...collected.findings.sheetEdges].sort((a, b) => a[0] - b[0]);
  for (const [key, count] of sheets) {
    const from = project.sheets[Math.floor(key / size)]?.path ?? '';
    const to = project.sheets[key % size]?.path ?? '';
    file.add(`${from} -> ${to}: ${plural(count, 'formula')}`);
  }
  if (sheets.length === 0) file.add('None.');
}

/** Positions of the cells with no formula that are read (inputs) or of formulas nothing reads. */
function positionsOf(parts: Parts, sheetId: number, inputs: boolean): number[] {
  const sheet = parts.project.sheets[sheetId];
  const covered = parts.covered[sheetId];
  if (sheet === undefined) return [];
  const positions: number[] = [];
  for (const k of sheet.grid.byColumn) {
    const formula = at(sheet.formulaIds, k) >= 0;
    const read = covered?.[k] === 1;
    if (inputs ? !formula && read : formula && !read) {
      positions.push(at(sheet.grid.cols, k) * POSITION + at(sheet.grid.rows, k));
    }
  }
  return positions;
}

function addCells(file: TextFile, parts: Parts, heading: string, inputs: boolean): void {
  file.section(heading);
  let any = false;
  for (const sheet of parts.project.sheets) {
    for (const range of rangesOf(positionsOf(parts, sheet.id, inputs))) {
      file.add(`${sheet.path}!${range}`);
      any = true;
    }
  }
  if (!any) file.add('None.');
}

function addCycles(file: TextFile, parts: Parts): void {
  file.section('## Circular references');
  const { cycles, collected, project } = parts;
  cycles.cycles.forEach((cycle, index) => {
    const bySheet = new Map<number, number[]>();
    for (const node of cycle.members) {
      const sheet = at(collected.nodeSheet, node);
      const list = bySheet.get(sheet) ?? [];
      list.push(at(collected.nodePosition, node));
      bySheet.set(sheet, list);
    }
    const count = plural(cycle.members.length, 'cell');
    const label = `circular reference ${String(index + 1)} (${count})`;
    for (const [sheet, positions] of [...bySheet].sort((a, b) => a[0] - b[0])) {
      const path = project.sheets[sheet]?.path ?? '';
      for (const range of rangesOf(positions)) file.add(`${path}!${range} ${label}`);
    }
  });
  if (cycles.cycles.length === 0) file.add('None.');
}

function addSheetList(
  file: TextFile,
  project: Project,
  map: ReadonlyMap<number, number[]>,
  note: string,
): void {
  for (const [sheet, positions] of [...map].sort((a, b) => a[0] - b[0])) {
    const path = project.sheets[sheet]?.path ?? '';
    for (const range of rangesOf(positions)) file.add(`${path}!${range} ${note}`);
  }
}

function addLimits(file: TextFile, parts: Parts): void {
  const { project, collected, cycles, limits } = parts;
  const { findings } = collected;
  file.section('## Limits reached');
  const before = file.lineCount;
  const tokens = String(MAX_REFERENCES_PER_FORMULA);
  addSheetList(file, project, findings.partial, `read in part: more than ${tokens} references`);
  const passed = `not read: the project passed the limit of ${String(limits.maxReferences)} references`;
  addSheetList(file, project, findings.notRead, passed);
  if (findings.droppedSheetEdges > 0) {
    const more = `${String(findings.droppedSheetEdges)} more than the limit of ${String(limits.maxSheetEdges)}`;
    file.add(`Sheet-to-sheet edges not listed: ${more}`);
  }
  if (cycles.notListed > 0) {
    const more = `${String(cycles.notListed)} more than the limit of ${String(limits.maxCyclesListed)}`;
    file.add(`Circular references not listed: ${more}`);
  }
  if (cycles.stoppedAfter !== undefined) {
    const steps = String(cycles.stoppedAfter);
    file.add(
      `Circular reference search stopped after ${steps} steps; circular references may be missing`,
    );
  }
  if (file.lineCount === before) file.add('None.');
}

/** The text of `dependencies.md` for the models and the folder names they were rendered with. */
export function renderDependencies(
  models: readonly WorkbookModel[],
  rendered: readonly RenderedNames[],
  limits: DependencyLimits,
  budget: ByteBudget,
): string {
  const project = buildProject(models, rendered);
  const collected = collect(project, limits);
  const parts: Parts = {
    project,
    collected,
    covered: coverage(project, collected.store),
    cycles: findCycles(project, collected.store, collected.nodeSheet.length, limits),
    limits,
  };
  const file = new TextFile(budget);
  addHeader(file, parts);
  addWorkbookEdges(file, parts);
  addSheetEdges(file, parts);
  addCells(file, parts, '## Input cells', true);
  addCells(file, parts, '## Output cells', false);
  addDefinedNames(file, project, collected.findings);
  addUnresolvedAndDynamic(file, project, collected.findings);
  addCycles(file, parts);
  addLimits(file, parts);
  return file.text();
}

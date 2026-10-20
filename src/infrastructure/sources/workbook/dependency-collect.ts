import { at, POSITION } from './dependency-grid.js';
import type { DependencyLimits } from './dependency-limits.js';
import type { Project, SheetNode, WorkbookNode } from './dependency-project.js';
import { Resolver, type Shift } from './dependency-resolve.js';
import { Findings, RefStore } from './dependency-store.js';
import { extractReferences, type ExtractedReferences } from './formula-references.js';
import type { CellFormula } from './workbook-model.js';

// RF-153: reads every formula of the project once, in a fixed order (sheet by sheet, row by row), and
// hands its references to the resolver. A shared formula is read once, for its first cell, and each
// cell it covers reads the same references moved by its distance from that cell. Nothing is
// evaluated, and the cost is the length of the formulas.

export interface Collected {
  readonly store: RefStore;
  readonly findings: Findings;
  /** For each formula node, its sheet and its position (`column * POSITION + row`). */
  readonly nodeSheet: readonly number[];
  readonly nodePosition: readonly number[];
}

interface SharedMaster {
  readonly col: number;
  readonly row: number;
  readonly refs: ExtractedReferences;
}

const NO_SHIFT: Shift = { columns: 0, rows: 0 };

function withoutEquals(text: string): string {
  return text.startsWith('=') ? text.slice(1) : text;
}

/** The first cell of every shared formula of a sheet, with the references of its text. */
function mastersOf(sheet: SheetNode, book: WorkbookNode): Map<number, SharedMaster> {
  const masters = new Map<number, SharedMaster>();
  const { grid } = sheet;
  for (let k = 0; k < grid.count; k += 1) {
    const formula = grid.cells[k]?.formula;
    if (formula?.kind !== 'shared' || formula.text === '' || formula.sharedIndex === undefined) {
      continue;
    }
    if (masters.has(formula.sharedIndex)) continue;
    const refs = extractReferences(withoutEquals(formula.text), { names: book.nameSet });
    masters.set(formula.sharedIndex, { col: at(grid.cols, k), row: at(grid.rows, k), refs });
  }
  return masters;
}

interface Source {
  readonly refs: ExtractedReferences;
  readonly shift: Shift;
}

function sourceOf(
  formula: CellFormula,
  where: { col: number; row: number },
  context: { book: WorkbookNode; masters: ReadonlyMap<number, SharedMaster> },
): Source | undefined {
  if (formula.kind === 'dataTable') return undefined;
  if (formula.kind === 'shared' && formula.text === '') {
    const master =
      formula.sharedIndex === undefined ? undefined : context.masters.get(formula.sharedIndex);
    if (master === undefined) return undefined;
    const shift = { columns: where.col - master.col, rows: where.row - master.row };
    return { refs: master.refs, shift };
  }
  const refs = extractReferences(withoutEquals(formula.text), { names: context.book.nameSet });
  return { refs, shift: NO_SHIFT };
}

export function collect(project: Project, limits: DependencyLimits): Collected {
  const store = new RefStore(limits.maxReferences);
  const findings = new Findings(limits, project.sheets.length);
  const resolver = new Resolver(project, store, findings);
  const nodeSheet: number[] = [];
  const nodePosition: number[] = [];
  for (const sheet of project.sheets) {
    const book = project.workbooks[sheet.workbook];
    if (book === undefined) continue;
    const { grid } = sheet;
    const masters = mastersOf(sheet, book);
    sheet.formulaIds = new Int32Array(grid.count).fill(-1);
    for (let k = 0; k < grid.count; k += 1) {
      const formula = grid.cells[k]?.formula;
      if (formula === undefined) continue;
      const where = { col: at(grid.cols, k), row: at(grid.rows, k) };
      sheet.formulaIds[k] = nodeSheet.length;
      nodeSheet.push(sheet.id);
      nodePosition.push(where.col * POSITION + where.row);
      store.begin();
      readOne(resolver, { sheet, ...where }, formula, { book, masters, findings, store });
    }
  }
  store.begin();
  return { store, findings, nodeSheet, nodePosition };
}

function readOne(
  resolver: Resolver,
  site: { sheet: SheetNode; col: number; row: number },
  formula: CellFormula,
  context: {
    book: WorkbookNode;
    masters: ReadonlyMap<number, SharedMaster>;
    findings: Findings;
    store: RefStore;
  },
): void {
  const position = site.col * POSITION + site.row;
  const source = sourceOf(formula, site, context);
  if (source === undefined) return;
  if (source.refs.truncated)
    context.findings.record(context.findings.partial, site.sheet.id, position);
  if (!resolver.read(site, source.refs.references, source.shift)) {
    context.findings.record(context.findings.notRead, site.sheet.id, position);
  }
}

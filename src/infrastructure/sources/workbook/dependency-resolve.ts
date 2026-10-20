import { nameTargets, resolveScope } from './dependency-scope.js';
import type { Project, SheetNode, WorkbookNode } from './dependency-project.js';
import { nameKey } from './dependency-project.js';
import type { Findings, RefStore } from './dependency-store.js';
import type { FormulaReference } from './formula-references.js';
import { shiftBox, type RefBox } from './reference-box.js';
import { structuredBox } from './table-reference.js';
import { POSITION } from './dependency-grid.js';
import type { DefinedName } from './workbook-model.js';

// RF-153: turns the references of one formula into what the map keeps: the cells it reads (as boxes
// in the store), the sheet-to-sheet and workbook-to-workbook edges, the defined names it uses, and the
// references that cannot be resolved or are dynamic. Every reference kept takes one unit of the
// store's budget; when the budget is gone the formula is reported as not read.

export interface FormulaSite {
  readonly sheet: SheetNode;
  /** 0-based column and 1-based row of the formula cell. */
  readonly col: number;
  readonly row: number;
}

/** How far a shared formula's dependent cell is from the cell the formula text was written for. */
export interface Shift {
  readonly columns: number;
  readonly rows: number;
}

function contains(box: RefBox, col: number, row: number): boolean {
  return col >= box.c1 && col <= box.c2 && row >= box.r1 && row <= box.r2;
}

export class Resolver {
  private site: FormulaSite | undefined;
  private ok = true;
  private readonly targets = new Set<number>();
  private readonly books = new Set<number>();
  private readonly seen = new Set<string>();
  private readonly names = new Set<DefinedName>();
  private readonly project: Project;
  private readonly store: RefStore;
  private readonly findings: Findings;

  constructor(project: Project, store: RefStore, findings: Findings) {
    this.project = project;
    this.store = store;
    this.findings = findings;
  }

  /** Reads one formula; false when the store ran out before it was read whole. */
  read(site: FormulaSite, refs: readonly FormulaReference[], shift: Shift): boolean {
    this.site = site;
    this.ok = true;
    this.targets.clear();
    this.books.clear();
    this.seen.clear();
    this.names.clear();
    for (const ref of refs) {
      if (this.failed()) break;
      this.one(ref, shift);
    }
    for (const target of this.targets) this.findings.addSheetEdge(site.sheet.id, target);
    for (const book of this.books) this.findings.addWorkbookEdge(site.sheet.workbook, book);
    return this.ok;
  }

  private failed(): boolean {
    return !this.ok;
  }

  private one(ref: FormulaReference, shift: Shift): void {
    if (ref.kind === 'range') this.range(ref.scope, shiftBox(ref.box, shift.columns, shift.rows));
    else if (ref.kind === 'name') this.name(ref);
    else if (ref.kind === 'table') this.table(ref);
    else this.dynamic(ref.fn);
  }

  private get here(): FormulaSite {
    if (this.site === undefined) throw new RangeError('A formula is read before it is resolved.');
    return this.site;
  }

  private workbook(): WorkbookNode {
    const book = this.project.workbooks[this.here.sheet.workbook];
    if (book === undefined) throw new RangeError('A sheet belongs to a workbook of the project.');
    return book;
  }

  private emit(sheet: SheetNode, box: RefBox): void {
    if (!this.store.spend()) {
      this.ok = false;
      return;
    }
    this.store.add(sheet.id, box);
    if (sheet.id !== this.here.sheet.id) this.targets.add(sheet.id);
    if (sheet.workbook !== this.here.sheet.workbook) this.books.add(sheet.workbook);
  }

  private range(scope: Parameters<typeof resolveScope>[2], box: RefBox): void {
    const resolved = resolveScope(this.project, this.here.sheet, scope);
    if (resolved.book !== undefined && resolved.book.index !== this.here.sheet.workbook) {
      this.books.add(resolved.book.index);
    }
    if (resolved.missing !== undefined) this.unresolved(resolved.missing);
    for (const sheet of resolved.sheets) this.emit(sheet, box);
  }

  private unresolved(message: string): void {
    const { sheet, col, row } = this.here;
    const key = `${String(sheet.id)}\u0000${message}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    if (!this.store.spend()) {
      this.ok = false;
      return;
    }
    this.findings.addUnresolved(sheet.id, message, col * POSITION + row);
  }

  private dynamic(fn: string): void {
    const { sheet, col, row } = this.here;
    const key = `${String(sheet.id)}\u0000${fn}`;
    if (this.seen.has(`d${key}`)) return;
    this.seen.add(`d${key}`);
    const entry = this.findings.dynamic.get(key) ?? { sheet: sheet.id, fn, positions: [] };
    entry.positions.push(col * POSITION + row);
    this.findings.dynamic.set(key, entry);
  }

  /** The defined name a reference means: local to a sheet first, then workbook-wide. */
  private definition(
    book: WorkbookNode,
    name: string,
    localSheet: string | undefined,
  ): DefinedName | undefined {
    const local =
      localSheet === undefined ? undefined : book.definedByKey.get(nameKey(localSheet, name));
    return local ?? book.definedByKey.get(nameKey(undefined, name));
  }

  /** The workbook a name lives in: its own, or the one an external name points at. */
  private bookOfName(ref: Extract<FormulaReference, { kind: 'name' }>): WorkbookNode | undefined {
    if (ref.scope.book === undefined) return this.workbook();
    const resolved = resolveScope(this.project, this.here.sheet, { book: ref.scope.book });
    if (resolved.missing !== undefined) this.unresolved(resolved.missing);
    return resolved.book;
  }

  private name(ref: Extract<FormulaReference, { kind: 'name' }>): void {
    const own = this.workbook();
    const book = this.bookOfName(ref);
    if (book === undefined) return;
    const sheetName = ref.scope.first ?? (book === own ? this.here.sheet.sheet.name : undefined);
    const def = this.definition(book, ref.name, sheetName);
    if (def === undefined || this.names.has(def)) return;
    this.names.add(def);
    if (book !== own) this.books.add(book.index);
    this.findings.useName(def, this.here.sheet.id);
    const targets = nameTargets(this.project, book, def);
    for (const target of targets.boxes) this.emit(target.sheet, target.box);
    for (const fn of targets.dynamic) this.dynamic(`${fn} through a defined name`);
  }

  private table(ref: Extract<FormulaReference, { kind: 'table' }>): void {
    const own = this.workbook();
    const { sheet, col, row } = this.here;
    const info =
      ref.table === undefined
        ? own.tables.find((t) => t.sheet.id === sheet.id && contains(t.box, col, row))
        : own.tableByName.get(ref.table.toLowerCase());
    if (info !== undefined) this.emit(info.sheet, structuredBox(info, ref.spec, row));
  }
}

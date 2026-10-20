import { at } from './dependency-grid.js';
import type { RefBox } from './reference-box.js';
import type { DefinedName } from './workbook-model.js';

// RF-153: what the map keeps while it reads the formulas, all of it counted against a limit. The
// references of every formula are stored as numbers in flat arrays (a sheet, four corners), not as
// objects, so two million formulas stay a few hundred megabytes at most.

const SHEET_SHIFT = 268_435_456; // 2^28: the sheet number above the 28 bits of two columns
const COLUMNS = 16_384;
const ROW_SHIFT = 2_097_152; // 2^21: a row number is at most 1,048,576

/** The references of all formulas, in the order the formulas are read. */
export class RefStore {
  private readonly where: number[] = [];
  private readonly rows: number[] = [];
  private readonly starts: number[] = [];
  private spent = 0;
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  get exhausted(): boolean {
    return this.spent >= this.max;
  }

  /** Takes one unit of the budget; false when the limit is reached. */
  spend(): boolean {
    if (this.spent >= this.max) return false;
    this.spent += 1;
    return true;
  }

  /** Marks where the references of the next formula start (call once more after the last). */
  begin(): void {
    this.starts.push(this.where.length);
  }

  add(sheet: number, box: RefBox): void {
    this.where.push(sheet * SHEET_SHIFT + box.c1 * COLUMNS + box.c2);
    this.rows.push(box.r1 * ROW_SHIFT + box.r2);
  }

  /** The references of formula `node` are the indices `[from, to)`. */
  rangeOf(node: number): { from: number; to: number } {
    return { from: at(this.starts, node), to: at(this.starts, node + 1) };
  }

  sheetAt(index: number): number {
    return Math.floor(at(this.where, index) / SHEET_SHIFT);
  }

  boxAt(index: number): RefBox {
    const where = at(this.where, index) % SHEET_SHIFT;
    const rows = at(this.rows, index);
    const r1 = Math.floor(rows / ROW_SHIFT);
    return {
      c1: Math.floor(where / COLUMNS),
      c2: where % COLUMNS,
      r1,
      r2: rows - r1 * ROW_SHIFT,
      fixed: 0,
    };
  }

  get size(): number {
    return this.where.length;
  }
}

export interface Unresolved {
  readonly sheet: number;
  readonly message: string;
  readonly positions: number[];
}

export interface DynamicUse {
  readonly sheet: number;
  readonly fn: string;
  readonly positions: number[];
}

/** The things the map found besides the references themselves. */
export class Findings {
  readonly workbookEdges = new Map<number, number>();
  readonly sheetEdges = new Map<number, number>();
  private readonly droppedEdges = new Set<number>();
  readonly unresolved = new Map<string, Unresolved>();
  readonly dynamic = new Map<string, DynamicUse>();
  /** Formulas that were not read at all, and formulas read only in part, by sheet. */
  readonly notRead = new Map<number, number[]>();
  readonly partial = new Map<number, number[]>();
  /** For each defined name, the formulas that use it per sheet. */
  readonly nameUsers = new Map<DefinedName, Map<number, number>>();
  private readonly maxSheetEdges: number;
  private readonly sheetCount: number;

  constructor(maxSheetEdges: number, sheetCount: number) {
    this.maxSheetEdges = maxSheetEdges;
    this.sheetCount = sheetCount;
  }

  get droppedSheetEdges(): number {
    return this.droppedEdges.size;
  }

  addWorkbookEdge(from: number, to: number): void {
    const key = from * 4096 + to;
    this.workbookEdges.set(key, (this.workbookEdges.get(key) ?? 0) + 1);
  }

  /** A sheet-to-sheet edge, counted once per formula; past the limit it is counted as left out. */
  addSheetEdge(from: number, to: number): void {
    const key = from * this.sheetCount + to;
    const known = this.sheetEdges.get(key);
    if (known !== undefined) this.sheetEdges.set(key, known + 1);
    else if (this.sheetEdges.size < this.maxSheetEdges) this.sheetEdges.set(key, 1);
    else if (this.droppedEdges.size < 1_000_000) this.droppedEdges.add(key);
  }

  record(map: Map<number, number[]>, sheet: number, position: number): void {
    const list = map.get(sheet);
    if (list === undefined) map.set(sheet, [position]);
    else list.push(position);
  }

  useName(name: DefinedName, sheet: number): void {
    const users = this.nameUsers.get(name) ?? new Map<number, number>();
    users.set(sheet, (users.get(sheet) ?? 0) + 1);
    this.nameUsers.set(name, users);
  }
}

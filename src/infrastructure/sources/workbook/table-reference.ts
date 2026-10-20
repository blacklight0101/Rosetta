import { FIXED_C1, FIXED_C2, FIXED_R1, FIXED_R2, type RefBox } from './reference-box.js';

// RF-153: a structured table reference (`Table1[Price]`, `Table1[[#This Row],[Price]]`, `[@Qty]`) as the
// cells it names. The table's range and column names come from the file; nothing is evaluated. The
// header row is not part of the data rows, `#All` and `#Headers` bring it in, and `#This Row` and `@`
// are the row of the formula.

const FIXED = FIXED_C1 | FIXED_R1 | FIXED_C2 | FIXED_R2;
const MAX_ITEMS = 64;

export interface TableShape {
  /** The whole range of the table, header row included. */
  readonly box: RefBox;
  readonly columns: readonly string[];
}

interface Spec {
  readonly columns: readonly string[];
  readonly items: ReadonlySet<string>;
  readonly thisRow: boolean;
}

/** `Name '[x']` -> `Name [x]`: the escape `'` makes the next character plain. */
function unescape(text: string): string {
  return text.replace(/'(.)/gu, '$1');
}

/** The bracket groups of a spec that hold no other group, in order: the items and column names. */
function leaves(spec: string): string[] {
  const found: string[] = [];
  let start = -1;
  for (let at = 0; at < spec.length && found.length < MAX_ITEMS; at += 1) {
    const char = spec.charAt(at);
    if (char === "'") at += 1;
    else if (char === '[') start = at + 1;
    else if (char === ']' && start >= 0) {
      found.push(spec.slice(start, at));
      start = -1;
    }
  }
  return found;
}

function parseSpec(spec: string): Spec {
  const columns: string[] = [];
  const items = new Set<string>();
  let thisRow = false;
  for (const leaf of leaves(spec)) {
    if (leaf.startsWith('#')) {
      items.add(leaf.toLowerCase());
      thisRow ||= leaf.toLowerCase() === '#this row';
    } else if (leaf.startsWith('@')) {
      thisRow = true;
      if (leaf.length > 1) columns.push(unescape(leaf.slice(1)));
    } else if (leaf !== '') {
      columns.push(unescape(leaf));
    }
  }
  return { columns, items, thisRow };
}

function columnSpan(table: TableShape, names: readonly string[]): { c1: number; c2: number } {
  const wanted = new Set(names.map((name) => name.toLowerCase()));
  const hits = table.columns
    .map((name, index) => (wanted.has(name.toLowerCase()) ? table.box.c1 + index : -1))
    .filter((column) => column >= 0);
  if (hits.length === 0) return { c1: table.box.c1, c2: table.box.c2 };
  return { c1: Math.min(...hits), c2: Math.max(...hits) };
}

function rowSpan(table: TableShape, spec: Spec, formulaRow: number): { r1: number; r2: number } {
  const { r1, r2 } = table.box;
  const first = Math.min(r1 + 1, r2);
  if (spec.items.has('#all')) return { r1, r2 };
  if (spec.items.has('#headers')) return { r1, r2: spec.items.has('#data') ? r2 : r1 };
  if (spec.items.has('#totals')) return { r1: r2, r2 };
  if (spec.thisRow && formulaRow >= first && formulaRow <= r2) {
    return { r1: formulaRow, r2: formulaRow };
  }
  return { r1: first, r2 };
}

/** The box a structured reference names inside `table`, for a formula on row `formulaRow`. */
export function structuredBox(table: TableShape, specText: string, formulaRow: number): RefBox {
  const spec = parseSpec(specText);
  return { ...columnSpan(table, spec.columns), ...rowSpan(table, spec, formulaRow), fixed: FIXED };
}

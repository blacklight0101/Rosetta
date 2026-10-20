import { extractReferences } from '../../src/infrastructure/sources/workbook/formula-references.js';
import type {
  FormulaReference,
  SheetScope,
} from '../../src/infrastructure/sources/workbook/formula-references.js';

// P3-47: formulas reduced to short strings so a tokenizer test reads like the formula it checks.

const LAST_COLUMN = 16_383;
const LAST_ROW = 1_048_576;

function columnLetters(index: number): string {
  let name = '';
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  }
  return name;
}

function scopeText(scope: SheetScope): string {
  const book =
    scope.book === undefined
      ? ''
      : 'index' in scope.book
        ? `[${String(scope.book.index)}]`
        : `[${scope.book.name}]`;
  const sheets = scope.first ?? '';
  const last = scope.last === undefined ? '' : `:${scope.last}`;
  return book === '' && sheets === '' ? '' : `${book}${sheets}${last}!`;
}

function boxText(ref: Extract<FormulaReference, { kind: 'range' }>): string {
  const { c1, r1, c2, r2, fixed } = ref.box;
  const mark = (bit: number): string => ((fixed & bit) === 0 ? '' : '$');
  const wholeColumn = r1 === 1 && r2 === LAST_ROW;
  const wholeRow = c1 === 0 && c2 === LAST_COLUMN;
  const first = `${mark(1)}${columnLetters(c1)}${mark(2)}${String(r1)}`;
  const last = `${mark(4)}${columnLetters(c2)}${mark(8)}${String(r2)}`;
  if (wholeColumn) return `${mark(1)}${columnLetters(c1)}:${mark(4)}${columnLetters(c2)}`;
  if (wholeRow) return `${mark(2)}${String(r1)}:${mark(8)}${String(r2)}`;
  return c1 === c2 && r1 === r2 ? first : `${first}:${last}`;
}

function referenceText(ref: FormulaReference): string {
  if (ref.kind === 'range') return `${scopeText(ref.scope)}${boxText(ref)}`;
  if (ref.kind === 'name') return `name:${scopeText(ref.scope)}${ref.name}`;
  if (ref.kind === 'table') return `table:${ref.table ?? ''}${ref.spec}`;
  return `dynamic:${ref.fn}`;
}

/** The references of a formula, each written as short text, in the order they appear. */
export function refsOf(formula: string, names: readonly string[] = []): string[] {
  const set = new Set(names.map((name) => name.toLowerCase()));
  return extractReferences(formula, { names: set }).references.map(referenceText);
}

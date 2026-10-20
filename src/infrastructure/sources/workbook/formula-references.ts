import {
  boxOfCells,
  boxOfColumns,
  boxOfRows,
  cellEndpoint,
  columnEndpoint,
  rowEndpoint,
  type Endpoint,
  type RefBox,
} from './reference-box.js';
import type { EditRecorder } from './external-edit.js';
import { isWordChar, MAX_BRACKET, Scanner } from './formula-scanner.js';

// RF-153, ADR-023, RFC-005 section 4.5: Rosetta's own tokenizer for Excel formulas. It returns the
// references a formula holds and nothing else: cells, ranges, whole columns and rows, sheet-qualified
// and quoted sheets, three-dimensional spans, external workbooks, structured table references and defined
// names; strings, numbers, functions and operators are skipped. A formula is never evaluated: `INDIRECT`
// and `OFFSET` are dynamic. One forward pass; the reference count is capped; a range stays one range.

type BookRef = { readonly index: number } | { readonly name: string };

/** The workbook and sheets a reference is qualified with; empty for a reference on its own sheet. */
export interface SheetScope {
  readonly book?: BookRef;
  readonly first?: string;
  /** The last sheet of a three-dimensional span (`Sheet1:Sheet3!A1`). */
  readonly last?: string;
}

export type FormulaReference =
  | { readonly kind: 'range'; readonly scope: SheetScope; readonly box: RefBox }
  | { readonly kind: 'table'; readonly table?: string; readonly spec: string }
  | { readonly kind: 'name'; readonly scope: SheetScope; readonly name: string }
  | { readonly kind: 'dynamic'; readonly fn: 'INDIRECT' | 'OFFSET' };

export interface ExtractOptions {
  /**
   * The lower-case defined names of the workbook. A word that is one of them is a name even when it
   * looks like a cell (`TAX1`); a word that is not one is not reported as a name. Without it every
   * word that could be a name is reported.
   */
  readonly names?: ReadonlySet<string>;
  /** Receives the place of the workbook part of each external reference (see `external-edit`). */
  readonly recorder?: EditRecorder;
}

export interface ExtractedReferences {
  readonly references: readonly FormulaReference[];
  /** True when the formula was cut at the length limit or had more references than the limit. */
  readonly truncated: boolean;
  /** Where the reading stopped because of the reference limit, if it did. */
  readonly stoppedAt?: number;
  /** Where the last token read began. */
  readonly lastStep: number;
}

/** The references kept for one formula; a formula with more says so (`truncated`). */
export const MAX_REFERENCES_PER_FORMULA = 4096;

/** A word of a share path (`\\server\share\`): a table name has no two backslashes. */
const UNC_PATH = /^\\\\|\\.*\\/u;
const FUNCTION_PREFIX = /^_XL(?:FN|WS|UDF)\./u;

function baseName(path: string): string {
  return path.split(/[\\/]/u).at(-1) ?? path;
}

function bookOf(text: string): BookRef {
  return /^[0-9]{1,6}$/u.test(text) ? { index: Number(text) } : { name: baseName(text) };
}

/** A word can be a name when it starts with a letter, `_`, `\` or a character beyond ASCII. */
function startsName(word: string): boolean {
  const char = word.charAt(0);
  return /[A-Za-z_\\]/u.test(char) || char.charCodeAt(0) > 127;
}

function scopeOf(book: BookRef | undefined, first: string, last: string): SheetScope {
  return {
    ...(book === undefined ? {} : { book }),
    ...(first === '' ? {} : { first }),
    ...(last === '' ? {} : { last }),
  };
}

/** The scope of a quoted prefix: `Sheet 1`, `Sheet 1:Sheet 3` or `C:\dir\[Book.xlsx]Sheet 1`. */
function scopeOfQuoted(inner: string): SheetScope {
  const open = inner.indexOf('[');
  const close = open < 0 ? -1 : inner.indexOf(']', open);
  const book = close > open ? bookOf(inner.slice(open + 1, close)) : undefined;
  const sheets = close > open ? inner.slice(close + 1) : inner;
  const colon = sheets.indexOf(':');
  if (colon < 0) return scopeOf(book, sheets, '');
  return scopeOf(book, sheets.slice(0, colon), sheets.slice(colon + 1));
}

class Parser {
  readonly references: FormulaReference[] = [];
  private full = false;
  private overflow = false;
  private readonly scan: Scanner;
  private readonly names: ReadonlySet<string> | undefined;
  private readonly recorder: EditRecorder | undefined;
  private stepStart = 0;

  constructor(formula: string, options: ExtractOptions) {
    this.scan = new Scanner(formula);
    this.names = options.names;
    this.recorder = options.recorder;
  }

  run(): ExtractedReferences {
    while (!this.scan.atEnd && !this.full) this.step();
    return {
      references: this.references,
      truncated: this.overflow || this.scan.cut,
      ...(this.full ? { stoppedAt: this.scan.pos } : {}),
      lastStep: this.stepStart,
    };
  }

  private push(reference: FormulaReference): void {
    if (this.references.length >= MAX_REFERENCES_PER_FORMULA) {
      this.overflow = true;
      this.full = true;
      return;
    }
    this.references.push(reference);
  }

  private step(): void {
    this.stepStart = this.scan.pos;
    const char = this.scan.peek();
    if (char === '"') this.scan.skipString();
    else if (char === "'") this.quoted();
    else if (char === '[') this.bracket();
    else if (char === '#') this.scan.skipError();
    else if (isWordChar(char)) this.word();
    else this.scan.pos += 1;
  }

  /** A word: a sheet prefix, a three-dimensional prefix, or the start of an operand. */
  private word(): void {
    const word = this.scan.readWord();
    const next = this.scan.peek();
    if (next === '!') {
      this.scan.pos += 1;
      this.afterPrefix(scopeOf(undefined, word, ''));
    } else if (next !== ':' || !this.threeDimensional(word)) {
      this.classify(word, {});
    }
  }

  private threeDimensional(first: string): boolean {
    const save = this.scan.pos;
    this.scan.pos += 1;
    const last = this.scan.readWord();
    if (last !== '' && this.scan.peek() === '!') {
      this.scan.pos += 1;
      this.afterPrefix(scopeOf(undefined, first, last));
      return true;
    }
    this.scan.pos = save;
    return false;
  }

  private quoted(): void {
    const start = this.scan.pos;
    const inner = this.scan.readQuoted();
    const followed = this.scan.peek() === '!';
    this.recorder?.quoted(start, this.scan.pos, followed || !this.scan.quoteClosed);
    if (inner === undefined || !followed) return;
    this.scan.pos += 1;
    this.afterPrefix(scopeOfQuoted(inner));
  }

  /** `[1]Sheet!A1`, `[Book.xlsx]Sheet!A1` and `[1]!Name`, or a structured reference with no table name. */
  private bracket(): void {
    const start = this.scan.pos;
    const spec = this.scan.readBracket();
    if (!spec.endsWith(']') || spec.length < 2) {
      this.longBracket(start, spec);
      return;
    }
    const inner = spec.slice(1, -1);
    const structured = inner.includes('[') || inner.startsWith('@') || inner.startsWith('#');
    const scope = structured ? undefined : this.externalScope(inner);
    if (scope === undefined) this.push({ kind: 'table', spec });
    else {
      this.recorder?.bracket(start, start + spec.length);
      this.afterPrefix(scope);
    }
  }

  /** A bracket group the scanner cut: the recorder may read it to its end to hide a path. */
  private longBracket(start: number, spec: string): void {
    if (this.recorder === undefined || spec.length < MAX_BRACKET) return;
    const next = this.recorder.long(start, this.scan.pos);
    if (next !== undefined) this.scan.pos = next;
  }

  /** The scope after `[book]` when a sheet and `!` follow, else undefined with the position kept. */
  private externalScope(inner: string): SheetScope | undefined {
    const save = this.scan.pos;
    const first = this.scan.readWord();
    let last = '';
    if (first !== '' && this.scan.peek() === ':') {
      this.scan.pos += 1;
      last = this.scan.readWord();
    }
    if (this.scan.peek() !== '!') {
      this.scan.pos = save;
      return undefined;
    }
    this.scan.pos += 1;
    return scopeOf(bookOf(inner), first, last);
  }

  private afterPrefix(scope: SheetScope): void {
    const char = this.scan.peek();
    if (char === '#') this.scan.skipError();
    else if (isWordChar(char)) this.classify(this.scan.readWord(), scope);
  }

  private classify(word: string, scope: SheetScope): void {
    const next = this.scan.peek();
    if (next === '(') this.call(word);
    else if (next === '[' && startsName(word)) this.tableOrShare(word);
    else if (this.names?.has(word.toLowerCase()) === true) {
      this.push({ kind: 'name', scope, name: word });
    } else if (!this.range(word, scope) && this.isNameLike(word, scope)) {
      this.push({ kind: 'name', scope, name: word });
    }
  }

  /** `Table1[Price]`, or the bracket after a share path (`\\server\share\[Book.xlsx]`) when rewriting. */
  private tableOrShare(word: string): void {
    if (this.recorder !== undefined && UNC_PATH.test(word)) this.bracket();
    else this.push({ kind: 'table', table: word, spec: this.scan.readBracket() });
  }

  private isNameLike(word: string, scope: SheetScope): boolean {
    if (!startsName(word)) return false;
    if (scope.book !== undefined) return true;
    if (this.names !== undefined) return false;
    const upper = word.toUpperCase();
    return upper !== 'TRUE' && upper !== 'FALSE';
  }

  private call(word: string): void {
    this.scan.pos += 1;
    const fn = word.toUpperCase().replace(FUNCTION_PREFIX, '');
    if (fn === 'INDIRECT' || fn === 'OFFSET') this.push({ kind: 'dynamic', fn });
  }

  /** A cell, a range, a whole column or a whole row that starts with `word`; false if it is none. */
  private range(word: string, scope: SheetScope): boolean {
    const cell = cellEndpoint(word);
    if (cell !== undefined) {
      const end = this.secondOperand(cellEndpoint) ?? cell;
      this.push({ kind: 'range', scope, box: boxOfCells(cell, end) });
      return true;
    }
    const column = columnEndpoint(word);
    const start = column ?? rowEndpoint(word);
    if (start === undefined || this.scan.peek() !== ':') return false;
    const end = this.secondOperand(column === undefined ? rowEndpoint : columnEndpoint);
    if (end === undefined) return false;
    const box = column === undefined ? boxOfRows(start, end) : boxOfColumns(start, end);
    this.push({ kind: 'range', scope, box });
    return true;
  }

  /** The corner after a `:` (it may carry a sheet name of its own), or undefined with the position kept. */
  private secondOperand(find: (word: string) => Endpoint | undefined): Endpoint | undefined {
    if (this.scan.peek() !== ':') return undefined;
    const save = this.scan.pos + 1;
    this.scan.pos = save;
    let word = this.scan.readWord();
    if (this.scan.peek() === '!') {
      this.scan.pos += 1;
      word = this.scan.readWord();
    }
    const end = find(word);
    if (end === undefined) this.scan.pos = save;
    return end;
  }
}

/**
 * The references of one formula (its text without the leading `=`), in the order they appear. Never
 * throws, never evaluates, and reads at most `MAX_FORMULA_CHARS` characters and
 * `MAX_REFERENCES_PER_FORMULA` references.
 */
export function extractReferences(
  formula: string,
  options: ExtractOptions = {},
): ExtractedReferences {
  return new Parser(formula, options).run();
}

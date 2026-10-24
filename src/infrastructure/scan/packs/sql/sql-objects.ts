import type { PackSymbol } from '../../../../application/ports/language-pack.js';
import type { DatabaseObjectKind } from '../../../../domain/code-map/vocabulary.js';

// P5-36, RF-104, DEC-11, ADR-013: the objects a SQL script creates (tables, views, procedures,
// triggers, functions) with their line ranges. One pass over the lines, plain string methods, no
// regular expression over file content. A line is cut to `maxLineLength` first, comments and the
// text of string literals are blanked, so a keyword in a comment or a string is never an object
// and a parenthesis in either never counts. An object ends before the next object header, a `GO`
// or `DELIMITER` line; a table ends where its first parenthesis closes.

const maxLineLength = 2000;
const maxNameLength = 200;
const maxObjectsPerFile = 1000;

const kinds: ReadonlyMap<string, DatabaseObjectKind> = new Map([
  ['table', 'table'],
  ['view', 'view'],
  ['procedure', 'procedure'],
  ['proc', 'procedure'],
  ['trigger', 'trigger'],
  ['function', 'stored-function'],
]);
const modifiers: ReadonlySet<string> = new Set(['or', 'alter', 'replace', 'materialized']);
const temporary: ReadonlySet<string> = new Set(['temporary', 'temp', 'global', 'local']);

interface Header {
  readonly kind: DatabaseObjectKind;
  readonly name: string;
  readonly line: number;
}

/** The lines with comments removed and string contents blanked; block comments span lines. */
function codeLines(lines: readonly string[]): string[] {
  let inBlock = false;
  return lines.map((raw) => {
    const line = raw.length > maxLineLength ? raw.slice(0, maxLineLength) : raw;
    let out = '';
    let quote = '';
    for (let at = 0; at < line.length; at += 1) {
      const char = line.charAt(at);
      const pair = line.slice(at, at + 2);
      if (inBlock) {
        if (pair === '*/') {
          inBlock = false;
          at += 1;
        }
      } else if (quote !== '') {
        if (char === quote) quote = '';
      } else if (pair === '--') {
        break;
      } else if (pair === '/*') {
        inBlock = true;
        at += 1;
      } else if (char === "'") {
        quote = char;
        out += char;
      } else {
        out += char;
      }
    }
    return out;
  });
}

function isSpace(char: string): boolean {
  return char === ' ' || char === '\t' || char === '\r';
}

/** Reads text from `at` as words and names, moving a cursor; no backtracking. */
class Cursor {
  at = 0;
  readonly #text: string;

  constructor(text: string) {
    this.#text = text;
  }

  #skip(): void {
    while (this.at < this.#text.length && isSpace(this.#text.charAt(this.at))) this.at += 1;
  }

  /** The next bare word, lower case, or '' when the next character starts no word. */
  word(): string {
    this.#skip();
    const start = this.at;
    while (this.at < this.#text.length && /[A-Za-z_]/u.test(this.#text.charAt(this.at)))
      this.at += 1;
    return this.#text.slice(start, this.at).toLowerCase();
  }

  /** Puts the cursor back where it was before a word that was not wanted. */
  back(to: number): void {
    this.at = to;
  }

  /** `[a].[b]`, `"a"."b"`, `` `a`.`b` `` or `a.b`: the last part, or undefined for a temporary name. */
  name(): string | undefined {
    this.#skip();
    for (;;) {
      const char = this.#text.charAt(this.at);
      const closer = ({ '[': ']', '"': '"', '`': '`' } as Record<string, string>)[char];
      let part: string;
      if (closer !== undefined) {
        const end = this.#text.indexOf(closer, this.at + 1);
        if (end < 0) return undefined;
        part = this.#text.slice(this.at + 1, end);
        this.at = end + 1;
      } else {
        const start = this.at;
        while (
          this.at < this.#text.length &&
          /[\p{L}\p{N}_$#@]/u.test(this.#text.charAt(this.at))
        ) {
          this.at += 1;
        }
        part = this.#text.slice(start, this.at);
        if (part.startsWith('#') || part.startsWith('@')) return undefined;
      }
      if (part === '') return undefined;
      if (this.#text.charAt(this.at) !== '.') return part.slice(0, maxNameLength);
      this.at += 1;
    }
  }
}

/** `create [or alter|replace] <type> [if not exists] <name>` (or `alter` for a non-table), at the line start. */
function headerOf(code: string, line: number): Header | undefined {
  const cursor = new Cursor(code);
  const first = cursor.word();
  if (first !== 'create' && first !== 'alter') return undefined;
  let word = cursor.word();
  while (modifiers.has(word)) word = cursor.word();
  if (temporary.has(word)) return undefined;
  const kind = kinds.get(word);
  if (kind === undefined || (first === 'alter' && kind === 'table')) return undefined;
  const before = cursor.at;
  if (cursor.word() === 'if') {
    cursor.word();
    cursor.word();
  } else {
    cursor.back(before);
  }
  const name = cursor.name();
  return name === undefined ? undefined : { kind, name, line };
}

function isBoundary(code: string): boolean {
  const word = code.trim().toLowerCase();
  return word === 'go' || /^go\s+\d+$/u.test(word) || word.startsWith('delimiter ');
}

/** The opening and the closing parentheses of a line, as a count each. */
function parens(line: string): { readonly open: number; readonly close: number } {
  let open = 0;
  let close = 0;
  for (const char of line) {
    if (char === '(') open += 1;
    else if (char === ')') close += 1;
  }
  return { open, close };
}

/** The line where the first parenthesis of a table closes, or `limit` when it does not. */
function tableEnd(codes: readonly string[], start: number, limit: number): number {
  let depth = 0;
  let opened = false;
  for (let index = start; index <= limit; index += 1) {
    const line = codes[index] ?? '';
    const { open, close } = parens(line);
    depth += open - close;
    opened = opened || open > 0;
    if (opened ? depth <= 0 : line.includes(';')) return index;
  }
  return limit;
}

function lastContent(codes: readonly string[], start: number, limit: number): number {
  let end = limit;
  while (end > start && (codes[end] ?? '').trim() === '') end -= 1;
  return end;
}

// P5-36
export function readSqlObjects(path: string, lines: readonly string[]): PackSymbol[] {
  const codes = codeLines(lines);
  const headers: Header[] = [];
  const boundaries: number[] = [];
  codes.forEach((code, index) => {
    if (isBoundary(code)) boundaries.push(index);
    else if (headers.length < maxObjectsPerFile) {
      const header = headerOf(code.trimStart(), index);
      if (header !== undefined) headers.push(header);
    }
  });
  let boundary = 0;
  return headers.map((header, number) => {
    while (boundary < boundaries.length && (boundaries[boundary] ?? 0) < header.line) boundary += 1;
    const nextHeader = headers[number + 1]?.line ?? codes.length;
    const nextBoundary = boundaries[boundary] ?? codes.length;
    const limit = Math.min(nextHeader, nextBoundary) - 1;
    const end =
      header.kind === 'table'
        ? tableEnd(codes, header.line, Math.max(header.line, limit))
        : lastContent(codes, header.line, Math.max(header.line, limit));
    return {
      path,
      kind: header.kind,
      name: header.name,
      startLine: header.line + 1,
      endLine: Math.max(header.line, Math.min(end, lines.length - 1)) + 1,
    };
  });
}

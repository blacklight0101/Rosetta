import type { SqlVerb } from '../../../domain/code-map/vocabulary.js';
import { leavesKeyOpen } from '../../guards/private-key-pieces.js';
import type { TextMasker } from '../../guards/secret-masker.js';
import type { SqlStatement } from './scan-types.js';
import {
  cutLine,
  leadingVerb,
  statementWindow,
  maxStatementsPerFile,
  statementText,
} from './sql-words.js';

// RF-103: statements of a `.sql` script. A statement starts at a line that begins with a verb and
// ends at a line ending in `;`, a `GO` line, a blank line or the next statement. A `SELECT` under an
// unfinished `INSERT` or `CREATE` belongs to it (`INSERT ... SELECT`, `CREATE VIEW ... AS SELECT`).

interface Pending {
  readonly line: number;
  readonly verb: SqlVerb;
  readonly parts: string[];
  length: number;
}

class ScriptReader {
  readonly statements: SqlStatement[] = [];
  readonly #path: string;
  #current: Pending | undefined;

  constructor(path: string) {
    this.#path = path;
  }

  feed(lineNumber: number, rawLine: string): void {
    const line = cutLine(rawLine).trim();
    if (line === '' || line.toUpperCase() === 'GO') {
      this.#close();
      return;
    }
    if (isComment(line)) return;
    const verb = leadingVerb(line);
    if (verb !== undefined && !this.#continuedBy(verb)) {
      this.#close();
      this.#current = { line: lineNumber, verb, parts: [], length: 0 };
    }
    this.#append(line);
    if (line.endsWith(';')) this.#close();
  }

  finish(): readonly SqlStatement[] {
    this.#close();
    return this.statements;
  }

  #continuedBy(verb: SqlVerb): boolean {
    const current = this.#current?.verb;
    return verb === 'SELECT' && (current === 'INSERT' || current === 'CREATE');
  }

  #append(line: string): void {
    const current = this.#current;
    if (current === undefined || current.length >= statementWindow) return;
    current.parts.push(line);
    current.length += line.length + 1;
  }

  #close(): void {
    const current = this.#current;
    this.#current = undefined;
    if (current === undefined || this.statements.length >= maxStatementsPerFile) return;
    this.statements.push({
      path: this.#path,
      line: current.line,
      verb: current.verb,
      text: statementText(current.parts.join(' ')),
    });
  }
}

function isComment(line: string): boolean {
  return line.startsWith('--') || line.startsWith('/*') || line.startsWith('*');
}

/** A verb word followed by more text. A line that is only a verb word is key text, not a statement. */
function startsStatement(line: string): boolean {
  return leadingVerb(line) !== undefined && /^[A-Za-z]+[\s(]\s*\S/u.test(line.trimStart());
}

/** A BEGIN or END line of a private key block, as the private-key rule of the SecretMasker spells it. */
const keyDelimiter = /-----(BEGIN|END) (?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----/u;

/** Whether the next key delimiter after line `index` is an END: the marker on `index` is then closed. */
function closedByLaterEnd(lines: readonly string[], index: number): boolean {
  for (let next = index + 1; next < lines.length; next += 1) {
    const match = keyDelimiter.exec(cutLine(lines[next] ?? ''));
    if (match !== null) return match[1] === 'END';
  }
  return false;
}

/** The text a key line is replaced with: the marker the SecretMasker writes for a private key. */
const keyLineMarker = '[MASKED:private-key]';

/** Where the script is cut, and which lines are key text (see `keySpans`). */
interface KeySpans {
  readonly cuts: readonly number[];
  readonly keyLines: ReadonlySet<number>;
}

/**
 * RF-141, RNF-003: where the script is cut before masking, and which lines are key text. The masker
 * masks a BEGIN marker with no END after it to the end of its text, which would hide every later
 * statement (a comment that only names the marker is enough). A stray marker is one whose next key
 * delimiter is another BEGIN or none. Its span starts at the next statement line, or at a BEGIN that
 * is itself stray, and ends at the next BEGIN or END line. Inside a span a statement line is kept and
 * every other non-blank line is key text, so a key body never reaches a statement, also when a
 * statement-looking line sits between two markers. A marker whose next delimiter is its own END is
 * closed by it and is left whole to the masker, so a statement-looking line inside a complete key
 * block never splits the block. A stray marker before a later complete block keeps the statements
 * between them.
 */
/** Where the scan stands: a stray marker still open (not cut yet), or a span after a cut. */
interface SpanState {
  readonly stray: boolean;
  readonly span: boolean;
}

const noSpan: SpanState = { stray: false, span: false };

/** The state after a BEGIN line that leaves a key open. A BEGIN that ends an open marker or span is a cut. */
/** The cuts and key lines found so far. */
interface Spans {
  readonly cuts: number[];
  readonly keyLines: Set<number>;
}

function afterBegin(
  lines: readonly string[],
  index: number,
  state: SpanState,
  spans: Spans,
): SpanState {
  const cut = state.stray || state.span;
  if (cut) spans.cuts.push(index);
  const stray = !closedByLaterEnd(lines, index);
  const span = cut && stray;
  if (span) spans.keyLines.add(index);
  return { stray, span };
}

function keySpans(lines: readonly string[]): KeySpans {
  const spans: Spans = { cuts: [], keyLines: new Set<number>() };
  let state = noSpan;
  for (let index = 0; index < lines.length; index += 1) {
    const line = cutLine(lines[index] ?? '');
    if (leavesKeyOpen(line)) {
      state = afterBegin(lines, index, state, spans);
    } else if (keyDelimiter.test(line)) {
      state = noSpan;
    } else if (state.span) {
      if (line.trim() !== '' && !startsStatement(line)) spans.keyLines.add(index);
    } else if (state.stray && startsStatement(line)) {
      spans.cuts.push(index);
      state = { stray: false, span: true };
    }
  }
  return { cuts: spans.cuts, keyLines: spans.keyLines };
}

/**
 * RF-141: the raw text is masked before comments are dropped, so a private key block is masked
 * whatever comment syntax surrounds its marker lines (`-----BEGIN` starts with `--`, `/* -----BEGIN`
 * opens a block comment). Masking keeps the line breaks of a block, so line numbers do not move.
 */
function maskedLines(lines: readonly string[], masker: TextMasker): readonly string[] {
  const { cuts, keyLines } = keySpans(lines);
  const text = lines.map((line, index) => (keyLines.has(index) ? keyLineMarker : line));
  const masked: string[] = [];
  let start = 0;
  for (const end of [...cuts, text.length]) {
    masked.push(...masker.mask(text.slice(start, end).join('\n')).text.split('\n'));
    start = end;
  }
  return masked;
}

/** The statements of a script, in file order. `lines` hold no line breaks. */
export function extractScriptStatements(
  path: string,
  lines: readonly string[],
  masker: TextMasker,
): readonly SqlStatement[] {
  const reader = new ScriptReader(path);
  maskedLines(lines, masker).forEach((line, index) => {
    reader.feed(index + 1, line);
  });
  return reader.finish();
}

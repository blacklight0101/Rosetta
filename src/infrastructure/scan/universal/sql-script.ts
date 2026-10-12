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

// The END line of a private key block, as the private-key rule of the SecretMasker spells it.
const keyEnd = /-----END (?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----/;

/** A verb word followed by more text. A line that is only a verb word is key text, not a statement. */
function startsStatement(line: string): boolean {
  return leadingVerb(line) !== undefined && /^[A-Za-z]+[\s(]\s*\S/u.test(line.trimStart());
}

/**
 * RF-141, RNF-003: where the script is cut before masking. The masker masks a BEGIN marker with no
 * END after it to the end of its text, which would hide every later statement (a comment that only
 * names the marker is enough). Such a marker can only follow the last END line, so from there the
 * span it opens is bounded at the next line that starts a statement: a key body or its header lines
 * never start with a SQL verb followed by a space and more text. Everything before the cut is still
 * masked.
 */
function cutsAfterOpenKeys(lines: readonly string[]): readonly number[] {
  const cuts: number[] = [];
  let open = false;
  for (
    let index = Math.max(
      lines.findLastIndex((line) => keyEnd.test(line)),
      0,
    );
    index < lines.length;
    index += 1
  ) {
    const line = cutLine(lines[index] ?? '');
    if (open && startsStatement(line)) {
      cuts.push(index);
      open = false;
    }
    if (!open) open = leavesKeyOpen(line);
  }
  return cuts;
}

/**
 * RF-141: the raw text is masked before comments are dropped, so a private key block is masked
 * whatever comment syntax surrounds its marker lines (`-----BEGIN` starts with `--`, `/* -----BEGIN`
 * opens a block comment). Masking keeps the line breaks of a block, so line numbers do not move.
 */
function maskedLines(lines: readonly string[], masker: TextMasker): readonly string[] {
  const masked: string[] = [];
  let start = 0;
  for (const end of [...cutsAfterOpenKeys(lines), lines.length]) {
    masked.push(...masker.mask(lines.slice(start, end).join('\n')).text.split('\n'));
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

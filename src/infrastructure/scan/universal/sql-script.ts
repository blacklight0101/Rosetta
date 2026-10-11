import type { SqlVerb } from '../../../domain/code-map/vocabulary.js';
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
    if (isComment(line) && !this.#keepsInsideStatement(line)) return;
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

  // A `--` line inside an open statement stays: the marker lines of a private key block start with
  // dashes, and the masker needs them to see the key (RF-141). Outside a statement it is dropped.
  #keepsInsideStatement(line: string): boolean {
    return this.#current !== undefined && line.startsWith('--');
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

/** The statements of a script, in file order. `lines` hold no line breaks. */
export function extractScriptStatements(
  path: string,
  lines: readonly string[],
): readonly SqlStatement[] {
  const reader = new ScriptReader(path);
  lines.forEach((line, index) => {
    reader.feed(index + 1, line);
  });
  return reader.finish();
}

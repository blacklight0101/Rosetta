import type { SqlStatement } from './scan-types.js';
import {
  cutLine,
  leadingVerb,
  looksLikeSql,
  maxStatementsPerFile,
  statementText,
} from './sql-words.js';

// RF-103: SQL in string literals of any language. The scan reads quotes only (`"`, `'`, backtick),
// so it needs no grammar: a literal that starts with a SQL verb and holds the words that go with
// it is a statement. A literal that is not closed on its line and starts with a verb continues over
// the next lines until the quote closes (C# verbatim strings, PHP and JavaScript multi-line strings).

const quotes = '"\'`';
const maxContinuedLines = 20;
const maxLookaheadLines = 2;
const continuationEnds = ['+', '&', '.', '_'];

interface Literal {
  readonly content: string;
  /** Index just after the closing quote, or the end of the line. */
  readonly end: number;
  readonly closed: boolean;
  readonly quote: string;
}

/** Reads the literal whose opening quote is at `open`. A doubled quote inside is one quote. */
function readLiteral(line: string, open: number): Literal {
  const quote = line.charAt(open);
  let content = '';
  for (let index = open + 1; index < line.length; index += 1) {
    const char = line.charAt(index);
    if (char === '\\') {
      content += line.slice(index, index + 2);
      index += 1;
    } else if (char !== quote) {
      content += char;
    } else if (content !== '' && line.charAt(index + 1) === quote) {
      content += char;
      index += 1;
    } else {
      return { content, end: index + 1, closed: true, quote };
    }
  }
  return { content, end: line.length, closed: false, quote };
}

function literalsOf(line: string): readonly Literal[] {
  const found: Literal[] = [];
  let position = 0;
  while (position < line.length) {
    if (quotes.includes(line.charAt(position))) {
      const literal = readLiteral(line, position);
      found.push(literal);
      position = literal.end;
    } else {
      position += 1;
    }
  }
  return found;
}

interface Continued {
  readonly text: string;
  /** The index of the line that closes the literal, or undefined when it never closes. */
  readonly endIndex: number | undefined;
}

/** The text of an unclosed literal on the lines after `index`, up to its closing quote. */
function continueLiteral(lines: readonly string[], index: number, quote: string): Continued {
  const parts: string[] = [];
  for (let next = index + 1; next < lines.length && next <= index + maxContinuedLines; next += 1) {
    const line = cutLine(lines[next] ?? '');
    const close = line.indexOf(quote);
    parts.push(close < 0 ? line : line.slice(0, close));
    if (close >= 0) return { text: parts.join(' '), endIndex: next };
  }
  return { text: parts.join(' '), endIndex: undefined };
}

function startsLiteralOrJoiner(line: string): boolean {
  const start = line.trimStart().charAt(0);
  return start !== '' && (quotes.includes(start) || continuationEnds.includes(start));
}

/** The literals of the next lines when the statement goes on after `+`, `&`, `.` or `_`. */
function lookahead(lines: readonly string[], index: number, rest: string): string {
  const parts: string[] = [];
  let joined = continuationEnds.some((end) => rest.trimEnd().endsWith(end));
  for (let next = index + 1; joined && next <= index + maxLookaheadLines; next += 1) {
    const line = cutLine(lines[next] ?? '');
    joined = startsLiteralOrJoiner(line);
    if (joined) parts.push(line.replaceAll(/["'`+&.;]/gu, ' '));
  }
  return parts.join(' ');
}

interface LineResult {
  readonly statements: readonly SqlStatement[];
  /** The index of the last line the statements used. */
  readonly lastIndex: number;
}

function statementsOfLine(path: string, lines: readonly string[], index: number): LineResult {
  const line = cutLine(lines[index] ?? '');
  const statements: SqlStatement[] = [];
  let lastIndex = index;
  for (const literal of literalsOf(line)) {
    const verb = leadingVerb(literal.content);
    if (verb === undefined) continue;
    const continued = literal.closed ? undefined : continueLiteral(lines, index, literal.quote);
    const text = continued === undefined ? literal.content : `${literal.content} ${continued.text}`;
    const rest = line.slice(literal.end);
    if (!looksLikeSql(verb, `${text} ${lookahead(lines, index, rest)}`)) continue;
    statements.push({ path, line: index + 1, verb, text: statementText(text) });
    lastIndex = Math.max(lastIndex, continued?.endIndex ?? index);
  }
  return { statements, lastIndex };
}

/** The statements found in string literals, in file order. `lines` hold no line breaks. */
export function extractEmbeddedStatements(
  path: string,
  lines: readonly string[],
): readonly SqlStatement[] {
  const found: SqlStatement[] = [];
  for (let index = 0; index < lines.length && found.length < maxStatementsPerFile; index += 1) {
    const result = statementsOfLine(path, lines, index);
    found.push(...result.statements);
    index = result.lastIndex;
  }
  return found.slice(0, maxStatementsPerFile);
}

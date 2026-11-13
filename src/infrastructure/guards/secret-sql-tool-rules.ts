import type { ScanRule, SecretSpan } from './scan-rule.js';
import { toolSource, valuePattern } from './secret-sql-tool-pieces.js';

// RF-141 (P10 lab fixes, P10 masker gaps): the SQL Server command-line tools (`sqlcmd`, `osql`,
// `bcp`) take the password after `-P` (case-sensitive: `-p` prints statistics), or after `/P` on
// Windows (all three accept it). The rule names no key, so it scans: from each tool name it reads
// the command token by token, for at most 512 characters, over the lines it continues (a trailing
// `\`, `^` or backtick), and every `-P` or `/P` it meets is read, not only the first. A quoted
// argument of another option (`-Q "SELECT -Price"`) is skipped whole, so a `-P` or a tool name
// inside it is not one. The command ends at a line end, an operator (`|`, `;`, `&`), `mysql` at the
// start of a continued line (its `-P` is a port), another tool name, which starts a command of its
// own, or the end of a string around the command. The value is a quoted value, the whole shell word
// or an exec array item (secret-sql-tool-pieces.ts). The scan is linear: the next tool name is
// looked for after the place the last command was read to, the walk back to a quote around the
// command stops there or at a delimiter, a step reads at least one character, a quoted argument
// that does not close is not tried again with the same quote in the command, and a value ends on
// its line.

type Quote = string | null;

const LIMIT = 512;
const tools = new RegExp(toolSource, 'g');
const values = new Map<string, RegExp>();
const lineBreak = /[\r\n\u2028\u2029]/u;
// `mysql` and `mariadb` start a command only at the start of a line the command continues (after an
// operator the command has already ended); as an argument (`-S mysql`, `-d mariadb`) they are not.
const ends = new RegExp(
  String.raw`[;|&]|(?<![^\s,[(])${toolSource}|(?<=[\\^\x60][ \t]*(?:\r\n|[\n\r\u2028\u2029])[ \t]*)(?:mysql(?:admin|dump)?|mariadb)(?![\w.-])`,
  'y',
);
const opener = /(?<![^\s,[(=])\\{0,4}["']/y;
// A single-quoted argument has no escape (POSIX shells, PowerShell); a double-quoted one is read
// with backslash escapes first and, when that would swallow a flag, without them (a Windows path
// that ends in a backslash: `-o "C:\out\"`).
const singleString = /'[^'\r\n]*'/y;
const doubleStrings = [/"(?:[^"\\\r\n]|\\[^\r\n])*"/y, /"[^"\r\n]*"/y];
const escapedString = /(?<e>\\{1,4})(?<q>["'])(?:[^\\\r\n]|\\+(?![\\"']))*(?<!\\)\k<e>\k<q>/y;
// Of the two readings of a double-quoted argument, the one that holds no password flag is skipped.
const flagInside = /(?:^|\s)[-/]P(?:\s|$|\\{0,4}["'])/u;
const step =
  /(?:[ \t,[]|[\\^\x60][ \t]*(?:\r\n|[\n\r\u2028\u2029]))+|[^\s,[;|&"'\\^\x60]+|[^\r\n\u2028\u2029]/y;

function valueOf(quote: Quote): RegExp {
  const key = quote ?? '';
  const known = values.get(key);
  if (known) return known;
  const made = valuePattern(quote);
  values.set(key, made);
  return made;
}

function stickyAt(pattern: RegExp, text: string, at: number): RegExpExecArray | null {
  pattern.lastIndex = at;
  return pattern.exec(text);
}

/**
 * The quote that opened a string around the command: the quote before the tool's path (`"c":
 * "sqlcmd`, `bash -c 'sqlcmd`), with its escape; null on a shell line or when a quote follows the
 * tool (an exec array item `"sqlcmd"`, a quoted path `"C:\...\sqlcmd.exe"`).
 */
function quoteAround(text: string, start: number, end: number, floor: number): Quote {
  if (/^\\{0,4}["']/u.test(text.slice(end, end + 5))) return null;
  let at = start;
  while (at > floor && start - at < LIMIT && !/[\s"',[;|&(]/u.test(text.charAt(at - 1))) at -= 1;
  const quote = text.charAt(at - 1);
  if (quote !== '"' && quote !== "'") return null;
  let escapes = 0;
  while (escapes < 4 && text.charAt(at - 2 - escapes) === '\\') escapes += 1;
  return `${'\\'.repeat(escapes)}${quote}`;
}

/** Whether the command ends here. */
function endsAt(text: string, at: number, quote: Quote): boolean {
  if (at >= text.length || lineBreak.test(text.charAt(at)) || stickyAt(ends, text, at)) return true;
  return quote !== null && text.startsWith(quote, at) && text.charAt(at - 1) !== '\\';
}

/** The end of a quoted argument that starts here, or -1; a quote that did not close is not retried. */
function quotedEnd(text: string, at: number, failed: Set<string>): number {
  const open = stickyAt(opener, text, at)?.[0];
  if (open === undefined || failed.has(open)) return -1;
  const patterns =
    open.length > 1 ? [escapedString] : open === "'" ? [singleString] : doubleStrings;
  const strings = patterns.flatMap((pattern) => stickyAt(pattern, text, at)?.[0] ?? []);
  const string = strings.find((each) => !flagInside.test(each)) ?? strings[0];
  if (string !== undefined) return at + string.length;
  failed.add(open);
  return -1;
}

/** The next place to read after a token that holds no flag. */
function skipped(text: string, at: number, failed: Set<string>): number {
  const quoted = quotedEnd(text, at, failed);
  if (quoted > at) return quoted;
  const token = stickyAt(step, text, at);
  return token ? at + token[0].length : at + 1;
}

/** A flag and its value here: the secret and the place after its closing quote. */
function valueAt(
  text: string,
  at: number,
  quote: Quote,
): { span: SecretSpan; next: number } | null {
  if (!/[-/"'\\]/u.test(text.charAt(at))) return null;
  const match = stickyAt(valueOf(quote), text, at);
  if (!match) return null;
  const end = at + match[0].length;
  const span: SecretSpan = [at + (match.groups?.['keep'] ?? '').length, end];
  return { span, next: end + (match.groups?.['close'] ?? '').length };
}

/** Reads one command from the end of its tool name, adds its secrets, returns where it stopped. */
function readCommand(text: string, from: number, quote: Quote, spans: SecretSpan[]): number {
  const failed = new Set<string>();
  let at = from;
  while (at - from <= LIMIT && !endsAt(text, at, quote)) {
    const value = valueAt(text, at, quote);
    if (value) spans.push(value.span);
    at = value ? value.next : skipped(text, at, failed);
  }
  return at;
}

/** RF-141: the passwords of the SQL Server tools' command lines in the text. */
function sqlToolSecrets(text: string): SecretSpan[] {
  const spans: SecretSpan[] = [];
  let floor = 0;
  tools.lastIndex = 0;
  for (let found = tools.exec(text); found; found = tools.exec(text)) {
    const toolEnd = found.index + found[0].length;
    const quote = quoteAround(text, found.index, toolEnd, floor);
    floor = Math.max(toolEnd, readCommand(text, toolEnd, quote, spans));
    tools.lastIndex = floor;
  }
  return spans;
}

export const sqlToolRules: readonly ScanRule<'password'>[] = [
  { kind: 'password', scan: sqlToolSecrets },
];

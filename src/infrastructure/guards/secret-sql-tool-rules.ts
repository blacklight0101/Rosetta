import type { ScanRule, SecretSpan } from './scan-rule.js';
import { toolSource, valuePattern } from './secret-sql-tool-pieces.js';

// RF-141 (P10 lab fixes, P10 masker gaps): the SQL Server command-line tools (`sqlcmd`, `osql`,
// `bcp`) take the password after `-P` (case-sensitive: `-p` prints statistics), or after `/P` on
// Windows (all three accept it). The rule names no key, so it scans: from each tool name it reads
// the command token by token, for at most 512 characters, over the lines it continues (a trailing
// `\`, `^` or backtick), and every `-P` or `/P` it meets is read, not only the first. A quoted
// argument of another option (`-Q "SELECT -Price"`) is skipped whole, so a `-P` inside it is not
// one; an argument that holds a tool name holds a command of its own, which is read before the
// command around it goes on after the argument. The command ends at a line end, an operator (`|`, `;`, `&`), `mysql` at the
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
// An escaped-quote argument is read the same way: with its escapes first and, when that swallows a
// flag or does not close, to the first quote with its escape (`\"C:\\out\\\"` in a JSON string),
// that second reading only when it holds no flag.
const escapedStrings = [escapedString, /(?<e>\\{1,4})(?<q>["'])[^\r\n]*?\k<e>\k<q>/y];
// Of the two readings of a double-quoted argument, the one that holds no password flag is skipped; a
// flag is any word that starts with `-P` or `/P`, attached values too (`-PSecret`).
const flagInside = /(?:^|\s)[-/]P/u;
// A quoted argument that holds a tool name at the start of a word holds a command of its own
// (`"sqlcmd -P x"`, `"[CMD, sqlcmd, -P, x]"`): the command reading it stops there, so the scan
// anchors on that tool, and goes on after the argument once the commands inside it are read.
const toolInside = new RegExp(String.raw`(?<![^\s,[("'])${toolSource}`, 'u');
// What follows a quoted argument that is another word of the command, not the end of a string.
const moreWords = /[ \t]+[^\s,;:|&)\]}>]/y;
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

/** The quoted argument that starts here, if any; a quote that did not close is not retried. */
function quotedArgument(text: string, at: number, failed: Set<string>): string | undefined {
  const open = stickyAt(opener, text, at)?.[0];
  if (open === undefined || failed.has(open)) return undefined;
  const patterns = open.length > 1 ? escapedStrings : open === "'" ? [singleString] : doubleStrings;
  const readings = patterns.map((pattern) => stickyAt(pattern, text, at)?.[0]);
  const fallback = open.length > 1 ? readings[0] : readings.find((each) => each !== undefined);
  const string = readings.find((each) => each !== undefined && !flagInside.test(each)) ?? fallback;
  if (string === undefined) failed.add(open);
  return string;
}

/**
 * Whether the command ends here. The quote of a string around the command ends it, unless it opens
 * a quoted argument that holds no flag and another word follows (`{"a":sqlcmd -o "C:\out\" -P x`).
 */
function endsAt(text: string, at: number, quote: Quote, failed: Set<string>): boolean {
  if (at >= text.length || lineBreak.test(text.charAt(at)) || stickyAt(ends, text, at)) return true;
  if (quote === null || !text.startsWith(quote, at) || text.charAt(at - 1) === '\\') return false;
  const argument = quotedArgument(text, at, failed);
  return (
    argument === undefined ||
    flagInside.test(argument) ||
    !stickyAt(moreWords, text, at + argument.length)
  );
}

/** The next place to read after a token that holds no flag. */
function skipped(text: string, at: number, argument: string | undefined): number {
  if (argument !== undefined) return at + argument.length;
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

/** A command that stopped at a quoted argument naming a tool, read on after that argument. */
interface Pending {
  readonly start: number;
  readonly at: number;
  readonly quote: Quote;
}

/**
 * Reads one command from `from` (`start` is the end of its tool name), adds its secrets and returns
 * where it stopped; a stop at a quoted argument that names a tool is pushed to `pending`.
 */
function readCommand(
  text: string,
  command: Omit<Pending, 'at'> & { readonly from: number },
  spans: SecretSpan[],
  pending: Pending[],
): number {
  const { start, quote } = command;
  const failed = new Set<string>();
  let at = command.from;
  while (at - start <= LIMIT && !endsAt(text, at, quote, failed)) {
    const value = valueAt(text, at, quote);
    if (value) spans.push(value.span);
    const argument = value ? undefined : quotedArgument(text, at, failed);
    if (argument !== undefined && toolInside.test(argument)) {
      pending.push({ start, at: at + argument.length, quote });
      return at;
    }
    at = value ? value.next : skipped(text, at, argument);
  }
  return at;
}

/** RF-141: the passwords of the SQL Server tools' command lines in the text. */
function sqlToolSecrets(text: string): SecretSpan[] {
  const spans: SecretSpan[] = [];
  const pending: Pending[] = [];
  let floor = 0;
  tools.lastIndex = 0;
  let found = tools.exec(text);
  for (;;) {
    // The next tool name after the place the last command was read to (found once per place).
    if (found && found.index < floor) {
      tools.lastIndex = floor;
      found = tools.exec(text);
    }
    const resumed = pending.at(-1);
    if (resumed && (!found || found.index >= resumed.at)) {
      // The commands inside the argument are read: the command around it goes on after it, unless
      // one of them already read past it.
      pending.pop();
      if (floor <= resumed.at)
        floor = readCommand(text, { ...resumed, from: resumed.at }, spans, pending);
      continue;
    }
    if (!found) return spans;
    const toolEnd = found.index + found[0].length;
    const quote = quoteAround(text, found.index, toolEnd, floor);
    const command = { start: toolEnd, from: toolEnd, quote };
    floor = Math.max(toolEnd, readCommand(text, command, spans, pending));
  }
}

export const sqlToolRules: readonly ScanRule<'password'>[] = [
  { kind: 'password', scan: sqlToolSecrets },
];

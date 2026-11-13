import { lineEnd, notContinuation, tokenBlank } from './secret-option-pieces.js';
import { caseless, placeholderValue } from './secret-value-pieces.js';

// RF-141 (P10 lab fixes, P10 masker gaps): the SQL Server command-line tools (`sqlcmd`, `osql`,
// `bcp`) take the password after `-P` (case-sensitive: `-p` prints statistics), or after `/P` on
// Windows (all three accept it). The rule names no key, so it is anchored on the tool name and finds
// the flag within 512 characters of the tool's line or of a line it continues (a trailing `\`, `^`
// or backtick), lazily. The scan stops at the next tool name, which is read by its own anchor, so
// each character is read by one anchor at most and the scan stays linear. One rule, three shapes:
//  - a quoted value (`-P "pw"`, `-P'pw'`, `-P \"pw\"` inside a JSON string, `"-P" "pw"`, the exec
//    array item `"-P", "pw"` and `"-P", \"pw\"`): it runs to the closing quote of the same kind and
//    escape, so the other quote (`"it's"`) and an escaped quote (`"a\"b"`) belong to it, and the
//    closing quote must end the shell word; with no closing quote it runs to the end of the line;
//  - a shell word (`-P pw`, `-Ppw`, `-P Fake"pw"`, `-P "Fake"pw`, `-P Fake\"pw\"`): the whole word,
//    bare and quoted parts joined, is the value and is masked with its quotes. A quoted part after
//    the first one never starts with a blank or a closing mark (`", "`, `"}`), which end a JSON or
//    shell string around the command rather than join the word;
//  - an exec array of plain items (YAML `[CMD, sqlcmd, -P, pw]`): a comma or a bracket ends it.
// The escape is one to four backslashes before the quote, as in secret-escaped-quote-rules.ts
// (P3-128). A value that starts with `$`, `%` or `-` is a password too; only an exact variable
// (`$VAR`, `$$VAR`, `${VAR}`, `$(cmd)`, `%VAR%`, outside single quotes), a one-letter flag (`-Q`), a
// placeholder, a bare word of prose and a masked value (`[MASKED:password]`, alone in its word) are
// left alone, so masking twice changes nothing.

interface SqlToolRule {
  readonly kind: 'password';
  readonly pattern: RegExp;
}

const tool = String.raw`(?<![\w.-])(?:${caseless('sqlcmd')}|${caseless('osql')}|${caseless('bcp')})(?:\.${caseless('exe')})?(?![\w.-])`;
const sep = tokenBlank;
// One character of the tool's line, or a continuation (the mark, blanks and the line end) as one
// step; the three alternatives start differently, so a run is read one way only.
const lineChar = String.raw`(?:(?!${tool})(?:[^\r\n\\^\x60]|[\\^\x60](?![ \t]*${lineEnd})|[\\^\x60][ \t]*${lineEnd}))`;
const onLine = String.raw`${tool}${lineChar}{0,512}?`;

// The flag: quoted (`"-P"`, `\"-P\"`, an exec array item) or a shell word (`-P`, `/P` and a blank).
const quotedFlag = String.raw`(?<=[\s,[])(?<fe>\\{0,4})(?<fq>["'])[-/]P(?<!\\)\k<fe>\k<fq>`;
const shellFlag = String.raw`(?<=\s)(?:-P${sep}*|/P${sep}+)`;
const flagThenQuote = String.raw`(?:${quotedFlag}${sep}*(?:,${sep}*)?|${shellFlag})(?<qe>\\{0,4})(?<qq>["'])`;
const flagThenItem = String.raw`(?<=[\s,[])[-/]P${sep}*,${sep}*`;
const flagThenWord = String.raw`(?:${quotedFlag}${sep}+|${shellFlag})`;

const marker = String.raw`\[MASKED:[a-z-]+\]`;
const name = '[A-Za-z_][A-Za-z0-9_]{0,63}';
const variable = String.raw`(?:\$\$?(?:${name}|\{${name}\})|\$\([^()\r\n]{0,256}\)|%${name}%)`;
const prose = '(?:to|as|the|and|or|is|with|for|flag|option|switch)';
const wordEnd = String.raw`(?=[\s,;|&)\]}<>"'\\\x60]|$)`;

// A quoted value: the closing quote must end the shell word (an escaped one may close a string
// around the command), or the value runs to the end of the line when it has none.
const close = String.raw`(?<!\\)\k<qe>\k<qq>`;
const afterClose = String.raw`(?:[\s,;|&)\]}<>\x60]|$|(?<=\\["'])\\{0,3}["'])`;
const quotedValue = [
  String.raw`(?<=["'])(?!${marker}(?:[\s"'\\]|$))(?!${placeholderValue})(?!(?<=")${variable}${close})`,
  String.raw`(?:(?!${close})[^\r\n])+(?=${close}${afterClose}|${lineEnd}|$)`,
].join('');

const leftAlone = [
  String.raw`(?:\\{0,4}["'])?${marker}${wordEnd}`,
  String.raw`(?:\\{0,4}")?${variable}(?:\\{0,4}")?${wordEnd}`,
  String.raw`(?:\\{0,4}["'])?${placeholderValue}`,
  `${prose}${wordEnd}`,
  String.raw`-[A-Za-z?]${wordEnd}`,
].join('|');

// An exec array item without quotes: a comma or a bracket ends it.
const itemValue = String.raw`(?=[^\s"',\]\\])(?<=,${sep}*)(?!${leftAlone})[^\s"',\]\\](?:[^"',\]\r\n\\]*[^\s"',\]\\])?`;

/**
 * The parts of a shell word; `guard` follows an opening quote. Each part starts with a quote, a
 * backslash or another character, and only a quote part that has no closing quote runs to the end of
 * the line, so a word is read one way only. An escaped-quote part ends at the next escaped quote,
 * whatever its escape, so a part that does not close there reads no further and the scan stays
 * linear.
 */
const partsOf = (n: string, guard: string): string =>
  [
    String.raw`"${guard}(?:[^"\\\r\n]|\\[^\r\n])*"`,
    String.raw`'${guard}[^'\r\n]*'`,
    String.raw`(?<pe${n}>\\{1,4})(?<pq${n}>["'])${guard}(?:[^\\\r\n]|\\+(?![\\"']))*(?<!\\)\k<pe${n}>\k<pq${n}>`,
    String.raw`\\{1,4}["']${guard}`,
    String.raw`\\(?!\\{0,3}["'])`,
    String.raw`[^\s"'\\]+`,
    String.raw`["']${guard}[^\r\n]*`,
  ].join('|');
const joined = String.raw`(?![\s,;:|&)\]}>]|$)`;
const wordValue = [
  String.raw`(?![\s,\]])${notContinuation}(?<=(?:[-/]P|["'][-/]P\\{0,4}["'])${sep}*)(?!${leftAlone})`,
  String.raw`(?:${partsOf('1', '')})(?:${partsOf('2', joined)})*`,
].join('');

export const sqlToolRules: readonly SqlToolRule[] = [
  {
    kind: 'password',
    pattern: new RegExp(
      String.raw`(?<keep>${onLine}(?:${flagThenQuote}|${flagThenItem}|${flagThenWord}))(?:${quotedValue}|${itemValue}|${wordValue})`,
      'g',
    ),
  },
];

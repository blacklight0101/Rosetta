import { lineEnd, notContinuation, tokenBlank } from './secret-option-pieces.js';
import { caseless, placeholderValue } from './secret-value-pieces.js';

// RF-141 (P10 masker gaps): the patterns of the SQL Server tool rule (secret-sql-tool-rules.ts). The
// value pattern, tried at one place of a tool's line, reads one flag and its value. `quote` is the
// quote that opened a string around the command (a JSON or `bash -c` string: `"`, `\"`, `'`), or
// null on a shell line.

/** A tool name: not part of a longer word, a path's extension or a dotted name. */
export const toolSource = String.raw`(?<![\w.-])(?:${caseless('sqlcmd')}|${caseless('osql')}|${caseless('bcp')})(?:\.${caseless('exe')})?(?![\w.-])`;
const sep = tokenBlank;

// The flag: quoted (`"-P"`, `\"-P\"`, an exec array item) or a shell word (`-P`, or `/P` and a
// blank). `/P` is not a flag when it is the argument of an option before it (`-i /P x.sql`), or
// when a path follows it (`/P /out.txt`).
const quotedFlag = String.raw`(?<=[\s,[])(?<fe>\\{0,4})(?<fq>["'])[-/]P(?<!\\)\k<fe>\k<fq>`;
const slashFlag = String.raw`(?<!(?<!\S)[-/](?![ECXeIWbRuknwTqNc])[A-Za-z][ \t]+)/P${sep}+(?![/\\])`;
const shellFlag = String.raw`(?<=\s)(?:-P${sep}*|${slashFlag})`;
const flagThenQuote = String.raw`(?:${quotedFlag}${sep}*(?:,${sep}*)?|${shellFlag})(?<qe>\\{0,4})(?<qq>["'])`;
const flagThenItem = String.raw`(?<=[\s,[])[-/]P${sep}*,${sep}*`;
const flagThenWord = String.raw`(?:${quotedFlag}${sep}+|${shellFlag})`;

const marker = String.raw`\[MASKED:[a-z-]+\]`;
// The note of the explained masker after a marker (masked-value.v1.md), read with it.
const markerNote = String.raw`${marker}(?: \([^()\r\n]{1,512}\))?`;
// A marker and its note, if it has one: a note always goes with its marker.
const wholeMarker = String.raw`${marker}(?: \([^()\r\n]{1,512}\)|(?! \([^()\r\n]{1,512}\)))`;
const name = '[A-Za-z_][A-Za-z0-9_]{0,63}';
// `${{ secrets.X }}`, `${X}`, `$(command)` (one nested pair of brackets), read to their end.
const enclosed = String.raw`\{\{(?:[^}\r\n]|\}(?!\})){0,256}\}\}|\{[^{}\r\n]{1,256}\}|\((?:[^()\r\n]|\([^()\r\n]{0,256}\)){0,256}\)`;
// A variable reference: `$X`, `$$X`, `$env:X`, `$a.b`, `$1`, `$@`, the enclosed forms, `%X%`, `%~1`.
const reference = String.raw`(?:\$(?:${enclosed}|\$?${name}(?::${name})?(?:\.${name})*|[0-9@*#?!])|%(?:${name}%|~[A-Za-z]{0,8}[0-9]))`;
// A placeholder word just before an escaped closing quote (`\"<password>\"`).
const placeholderWord = String.raw`<[A-Za-z][A-Za-z_-]{0,29}>|\{[A-Za-z][A-Za-z_-]{0,29}\}`;
const prose = '(?:to|too|also|as|the|and|or|is|with|for|flag|option|switch)';
// What may follow an opening quote of the string around the command when that quote ends it.
const closing = String.raw`[\s,;:|&)\]}>]|$`;

const escaped = (quote: string): string => quote.replaceAll('\\', '\\\\');

/** The end of a shell word: a blank, an operator, or the quote that ends the string around it. */
function wordEnd(quote: string | null): string {
  const end = String.raw`[\s|&;<>\x60)]|$`;
  return quote === null ? `(?=${end})` : `(?=${end}|${escaped(quote)}(?:${closing}))`;
}

/** The whole word is one token that is left alone: a reference, a masked value, a placeholder. */
function leftAlone(quote: string | null): string {
  const end = wordEnd(quote);
  return [
    String.raw`(?:\\{0,4}["'])?${wholeMarker}(?:\\{0,4}["'])?${end}`,
    String.raw`(?:\\{0,4}")?${reference}(?:\\{0,4}")?${end}`,
    String.raw`(?:\\{0,4}["'])?${placeholderValue}(?:\\{0,4}["'])?${end}`,
    String.raw`\\{0,4}["'](?:${placeholderWord})\\{0,4}["']${end}`,
    `${prose}[.,:!?]?${end}`,
    String.raw`-[A-Za-z?]${end}`,
  ].join('|');
}

// A quoted value: the closing quote (group `close`) must end the shell word (an escaped one may
// close a string around the command), or the value runs to the end of the line when it has none.
const close = String.raw`(?<!\\)\k<qe>\k<qq>`;
const afterClose = String.raw`(?:[\s,;|&)\]}<>\x60]|$|(?<=\\["'])\\{0,3}["'])`;
const quotedValue = [
  String.raw`(?<=["'])(?!${marker}(?:[\s"'\\]|$))(?!${placeholderValue})(?!(?:(?<=")${reference}|${placeholderWord})${close})`,
  String.raw`(?:(?!${close})[^\r\n])+(?=(?<close>${close})${afterClose}|${lineEnd}|$)`,
].join('');

// An exec array item without quotes: a comma or a bracket ends it.
const itemAlone = String.raw`(?:${marker}|${reference}|${placeholderValue}|${prose}|-[A-Za-z?])(?=[\s,\]]|$)`;
const itemValue = String.raw`(?=[^\s"',\]\\])(?<=,${sep}*)(?!${itemAlone})[^\s"',\]\\](?:[^"',\]\r\n\\]*[^\s"',\]\\])?`;

/**
 * The parts of a shell word; `guard` follows an opening quote. Each part starts with a quote, a
 * backslash, a marker, a `$`, a `[` or another character, and only a quote part with no closing quote
 * runs to the end of the line, so a word is read one way only. An escaped-quote part ends at the next
 * escaped quote, whatever its escape, so a part that does not close there reads no further.
 */
const partsOf = (n: string, guard: string): string =>
  [
    String.raw`"${guard}(?:[^"\\\r\n]|\\[^\r\n])*"`,
    String.raw`'${guard}[^'\r\n]*'`,
    String.raw`(?<pe${n}>\\{1,4})(?<pq${n}>["'])${guard}(?:[^\\\r\n]|\\+(?![\\"']))*(?<!\\)\k<pe${n}>\k<pq${n}>`,
    String.raw`\\{1,4}["']${guard}`,
    String.raw`\\(?!\\{0,3}["'])`,
    markerNote,
    String.raw`\$(?:${enclosed})`,
    String.raw`[$[]`,
    String.raw`[^\s"'\\$[]+`,
    String.raw`["']${guard}[^\r\n]*`,
  ].join('|');

/**
 * A quote part after the first one joins the word, as a shell joins it, unless it ends the line or
 * it is the quote of the string around the command followed by a closing mark (`", "`, `"}`).
 */
function joinGuard(quote: string | null): string {
  const notLast = String.raw`(?![\r\n]|$)`;
  return quote === null
    ? notLast
    : String.raw`(?!(?<=(?<!\\)${escaped(quote)})(?:${closing}))${notLast}`;
}

function wordValue(quote: string | null): string {
  return [
    String.raw`(?![\s,])(?!\](?:[\s,]|$))${notContinuation}`,
    String.raw`(?<=(?:[-/]P|["'][-/]P\\{0,4}["'])${sep}*)(?!${leftAlone(quote)})`,
    String.raw`(?:${partsOf('1', '')})(?:${partsOf('2', joinGuard(quote))})*`,
  ].join('');
}

/** The sticky pattern of one flag and its value, for a line in the string opened by `quote`. */
export function valuePattern(quote: string | null): RegExp {
  return new RegExp(
    String.raw`(?<keep>${flagThenQuote}|${flagThenItem}|${flagThenWord})(?:${quotedValue}|${itemValue}|${wordValue(quote)})`,
    'y',
  );
}

// RF-146, RF-152: how text from a workbook is written into a line. Everything a workbook holds is
// untrusted, so a text never reaches a rendered line as it is: a line break, a control character
// or a character a reader could split a line at is escaped, and a long text is cut with a note of
// how much was left out. Nothing here allocates more than the cap it is given.

/** The longest rendered line. RF-146 cuts a line at 2,000 characters, so a line stays well under. */
export const MAX_LINE = 1900;
/** The longest name (workbook, sheet, table, defined name) written, so a label stays bounded. */
export const NAME_CAP = 100;

const SHORT_ESCAPES: ReadonlyMap<string, string> = new Map([
  ['\n', '\\n'],
  ['\r', '\\r'],
  ['\t', '\\t'],
]);

export interface QuoteOptions {
  /** Write `|` as `|`, for a cell of a Markdown table. */
  readonly pipes?: boolean;
}

function hex4(code: number): string {
  return `\\u${code.toString(16).padStart(4, '0')}`;
}

function isSplitter(code: number): boolean {
  return (
    code < 0x20 ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x2028 ||
    code === 0x2029 ||
    (code >= 0xd800 && code <= 0xdfff)
  );
}

/** One character as it is written; `quote` also escapes the quote and the backslash. */
function escapeChar(char: string, quote: boolean, pipes: boolean): string {
  const short = SHORT_ESCAPES.get(char);
  if (short !== undefined) return short;
  if (quote && (char === '"' || char === '\\')) return `\\${char}`;
  if (pipes && char === '|') return hex4(0x7c);
  const code = char.codePointAt(0) ?? 0;
  // A pair of surrogates is one character (length 2); a lone surrogate arrives as length 1.
  return char.length === 1 && isSplitter(code) ? hex4(code) : char;
}

function bounded(text: string, maxChars: number, quote: boolean, pipes: boolean): string {
  let out = '';
  let used = 0;
  for (const char of text) {
    const piece = escapeChar(char, quote, pipes);
    if (out.length + piece.length > maxChars) break;
    out += piece;
    used += char.length;
  }
  const left = text.length - used;
  return left > 0 ? `${out}...(+${String(left)} characters)` : out;
}

/** A JSON string: quotes and backslashes escaped, control characters and line breaks escaped. */
export function quoteText(text: string, maxChars: number, options: QuoteOptions = {}): string {
  return `"${bounded(text, maxChars, true, options.pipes === true)}"`;
}

/** Text for a formula or a rule: kept readable (quotes untouched) but never more than one line. */
export function escapeInline(text: string, maxChars: number): string {
  return bounded(text, maxChars, false, false);
}

/** A name cut to `NAME_CAP` characters with a note, written plainly (the mapping in the result). */
export function capName(text: string): string {
  return text.length <= NAME_CAP
    ? text
    : `${text.slice(0, NAME_CAP)}...(+${String(text.length - NAME_CAP)} characters)`;
}

/** A line that is over the limit is cut and ends in ` ...`; the last stage before a line is written. */
export function cutLine(line: string): string {
  if (line.length <= MAX_LINE) return line;
  let end = MAX_LINE - 4;
  const last = line.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end -= 1;
  return `${line.slice(0, end)} ...`;
}

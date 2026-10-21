// RF-141, DEC-57: private keys that arrive in pieces. A paged read (RF-144) can hold the BEGIN line
// of a key and stop in its body, or start in the body and hold the END line, so the whole-block
// rule of SecretMasker never sees both ends. Two rules close that gap:
//   - an END line without its BEGIN line takes the key lines right above it;
//   - a piece that follows a piece which left a key open is masked from its start over its key
//     lines, and the key stays open while a whole piece is key lines.
// Both work line by line, so a key written in source code counts too: a line is a key line when,
// once the code around a string literal is removed (indentation, list and comment marks, quotes, a
// string prefix such as b" or @", escaped line breaks, concatenation operators, separators and
// statement ends), what is left is base64 of 16 characters or more. A shorter base64 line counts
// right above an END line or as the last line of a piece (a key's last line is short), and an
// empty remainder (a blank line, a lone `)`) counts inside a key. Prose and code identifiers of 16
// letters or more right above an orphan END line are masked too, which is the safe side.
// Linear time: each line is looked at a bounded number of times, and a walk back stops at the
// previous END. Line breaks stay, so line numbers do not move. The number read_file writes in
// front of a line (`12: `) is not part of the line.
// Known limit: a key written inline with no BEGIN or END line, such as the bare base64 body of a
// DER key in a setting (`key: "MII...`), is not masked. Nothing marks it as a key: these rules
// start only from a BEGIN or END line, and SecretMasker's password rules match only the names
// password, passwd and pwd. Catching it needs a rule on the value itself (a DER prefix or its
// entropy), which no requirement asks for yet.

const keyLabel = String.raw`(?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----`;
const beginPattern = new RegExp(String.raw`-----BEGIN ${keyLabel}`, 'g');
const endPattern = new RegExp(String.raw`-----END ${keyLabel}`, 'g');
const endInLine = new RegExp(String.raw`-----END ${keyLabel}`);
const marker = '[MASKED:private-key]';
/** A key line holds at least this many base64 characters; a shorter one only at the key's end. */
const keyLineLength = 16;

const quotes = new Set(['"', "'", '`']);
const leadingCode = new Set([
  ' ',
  '\t',
  '+',
  ',',
  '.',
  '&',
  '(',
  '[',
  '{',
  '-',
  '*',
  '#',
  '/',
  ...quotes,
]);
const trailingCode = new Set([
  ' ',
  '\t',
  '\r',
  '+',
  ',',
  '.',
  '&',
  ';',
  ')',
  ']',
  '}',
  '_',
  ...quotes,
]);
/** Line-break constants that code appends to a line of a key. */
const lineBreakNames = [
  'vbCrLf',
  'vbLf',
  'vbNewLine',
  'Environment.NewLine',
  'System.lineSeparator()',
  'os.linesep',
  'PHP_EOL',
];
const base64 = /[A-Za-z0-9+/=]/;

type LineKind = 'key' | 'short' | 'blank' | 'other';

export interface KeyPieceResult {
  readonly text: string;
  /** How many key pieces were replaced. */
  readonly count: number;
}

/** The line breaks of the masked text, so the result keeps its line count and line numbers. */
export function lineBreaksOf(secret: string): string {
  return (secret.match(/\r?\n/g) ?? []).join('');
}

/** Whether an escaped line break (`\n`, `\r`) starts at `index`. */
function escapedBreakAt(line: string, index: number): boolean {
  return (
    line.charAt(index) === '\\' &&
    (line.charAt(index + 1) === 'n' || line.charAt(index + 1) === 'r')
  );
}

/** A line number and a colon, as read_file puts them in front of each line (`12: `, RF-202). */
const lineNumberLead = /^\d{1,9}: /;

/** Where the text left of a line's code wrapping starts. */
function contentStart(line: string): number {
  let start = lineNumberLead.exec(line)?.[0].length ?? 0;
  while (start < line.length && leadingCode.has(line.charAt(start))) start += 1;
  // A string prefix (b"...", @"...", $"...", u8"...") before the opening quote.
  const prefix = /^(?:[A-Za-z0-9@$]{1,2})["'`]/.exec(line.slice(start, start + 3));
  return prefix === null ? start : start + prefix[0].length;
}

/** Where the text right of a line's code wrapping ends, never before `start`. */
function contentEnd(line: string, start: number): number {
  let end = line.length;
  while (end > start) {
    if (trailingCode.has(line.charAt(end - 1))) end -= 1;
    else if (end - start >= 2 && escapedBreakAt(line, end - 2)) end -= 2;
    else {
      const name = lineBreakNames.find((item) => line.endsWith(item, end));
      if (name === undefined || end - name.length < start) break;
      end -= name.length;
    }
  }
  return end;
}

/** What one line is once the code around a string literal is removed. */
function lineKind(line: string): LineKind {
  const start = contentStart(line);
  const end = contentEnd(line, start);
  let characters = 0;
  for (let index = start; index < end; index += 1) {
    if (escapedBreakAt(line, index)) index += 1;
    else if (base64.test(line.charAt(index))) characters += 1;
    else return 'other';
  }
  if (characters === 0) return 'blank';
  return characters < keyLineLength ? 'short' : 'key';
}

/** Where the line that ends right before `index` starts, or undefined when it starts before `floor`. */
function lineStartBefore(text: string, index: number, floor: number): number | undefined {
  let start = index;
  while (start > floor && text.charAt(start - 1) !== '\n') start -= 1;
  const whole = start > floor || floor === 0 || text.charAt(floor - 1) === '\n';
  return whole ? start : undefined;
}

/** Where the key lines right above the line that starts at `lineStart` start, never before `floor`. */
function keyLinesAbove(text: string, lineStart: number, floor: number): number | undefined {
  let top: number | undefined;
  let start = lineStart;
  while (start > floor) {
    const above = lineStartBefore(text, start - 1, floor);
    if (above === undefined) break;
    const kind = lineKind(text.slice(above, start - 1));
    const key = kind === 'key' || (kind === 'short' && top === undefined);
    if (!key && kind !== 'blank') break;
    if (key) top = above;
    start = above;
  }
  return top;
}

/** Where the masked tail of the key that ends with the END line at `endIndex` starts. */
function tailStart(text: string, endIndex: number, floor: number): number {
  const lineStart = lineStartBefore(text, endIndex, floor);
  if (lineStart === undefined) return endIndex;
  const above = keyLinesAbove(text, lineStart, floor);
  if (above !== undefined) return above;
  return lineKind(text.slice(lineStart, endIndex)) === 'other' ? endIndex : lineStart;
}

// RF-141
export function maskOrphanKeyEnds(text: string): KeyPieceResult {
  let masked = '';
  let position = 0;
  let count = 0;
  for (const match of text.matchAll(endPattern)) {
    const start = tailStart(text, match.index, position);
    const end = match.index + match[0].length;
    masked += `${text.slice(position, start)}${marker}${lineBreaksOf(text.slice(start, end))}`;
    position = end;
    count += 1;
  }
  return { text: masked + text.slice(position), count };
}

/** Where the key lines a piece starts with end, and whether the key runs past the piece. */
function continuationEnd(text: string): { readonly end: number; readonly open: boolean } {
  let end = 0;
  let position = 0;
  for (;;) {
    const lineEnd = lineEndAt(text, position);
    const line = text.slice(position, lineEnd);
    const closing = endInLine.exec(line);
    if (closing !== null) return { end: position + closing.index + closing[0].length, open: false };
    const last = lineEnd === text.length;
    const kind = lineKind(line);
    const lastOfKey = last || endInLine.test(text.slice(lineEnd + 1, lineEndAt(text, lineEnd + 1)));
    if (kind === 'key' || (kind === 'short' && lastOfKey)) end = lineEnd;
    else if (kind !== 'blank') return { end, open: false };
    if (last) return { end, open: true };
    position = lineEnd + 1;
  }
}

/** Where the line that starts at `position` ends. */
function lineEndAt(text: string, position: number): number {
  const newline = text.indexOf('\n', position);
  return newline < 0 ? text.length : newline;
}

/** The piece with the key lines it starts with masked, and whether the key is still open after it. */
// RF-141
export function maskKeyContinuation(text: string): KeyPieceResult & { readonly open: boolean } {
  const { end, open } = continuationEnd(text);
  if (end === 0) return { text, count: 0, open };
  const masked = `${marker}${lineBreaksOf(text.slice(0, end))}${text.slice(end)}`;
  return { text: masked, count: 1, open };
}

/** Whether the text opens a key block it does not close. */
// RF-141
export function leavesKeyOpen(text: string): boolean {
  const lastIndex = (pattern: RegExp): number =>
    Array.from(text.matchAll(pattern), (match) => match.index).at(-1) ?? -1;
  const begin = lastIndex(beginPattern);
  return begin >= 0 && begin > lastIndex(endPattern);
}

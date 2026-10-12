// RF-141, DEC-57: private keys that arrive in pieces. A paged read (RF-144) can hold the BEGIN line
// of a key and stop in its body, or start in the body and hold the END line, so the whole-block
// rule of SecretMasker never sees both ends. Two rules close that gap, both in linear time:
//   - an END line without its BEGIN line takes the key body above it back to the first character
//     that cannot belong to a key;
//   - a piece that follows a piece which left a key open is masked from its start over the same
//     characters, and the key stays open while a whole piece is key text.
// Each character is looked at a bounded number of times: a walk back stops at the previous END.
// Key text is base64, padding, the `\` of escaped line breaks, spaces, tabs and line breaks; so
// prose made of letters and spaces right above an orphan END line is masked too, which is the
// safe side. Line breaks stay, so line numbers do not move.

const keyCharacter = /[A-Za-z0-9+/=\\ \t\r\n]/;
const keyLabel = String.raw`(?:[A-Z0-9]{1,16} ){0,4}PRIVATE KEY(?: BLOCK)?-----`;
const beginPattern = new RegExp(String.raw`-----BEGIN ${keyLabel}`, 'g');
const endPattern = new RegExp(String.raw`-----END ${keyLabel}`, 'g');
const marker = '[MASKED:private-key]';

export interface KeyPieceResult {
  readonly text: string;
  /** How many key pieces were replaced. */
  readonly count: number;
}

/** The line breaks of the masked text, so the result keeps its line count and line numbers. */
export function lineBreaksOf(secret: string): string {
  return (secret.match(/\r?\n/g) ?? []).join('');
}

/** Where the key body that ends at `end` starts, never before `floor`. */
function bodyStart(text: string, end: number, floor: number): number {
  let start = end;
  while (start > floor && keyCharacter.test(text.charAt(start - 1))) start -= 1;
  return start;
}

// RF-141
export function maskOrphanKeyEnds(text: string): KeyPieceResult {
  let masked = '';
  let position = 0;
  let count = 0;
  for (const match of text.matchAll(endPattern)) {
    const start = bodyStart(text, match.index, position);
    const end = match.index + match[0].length;
    masked += `${text.slice(position, start)}${marker}${lineBreaksOf(text.slice(start, end))}`;
    position = end;
    count += 1;
  }
  return { text: masked + text.slice(position), count };
}

/** The piece with the key body it starts with masked, and whether the key is still open after it. */
// RF-141
export function maskKeyContinuation(text: string): KeyPieceResult & { readonly open: boolean } {
  let end = 0;
  while (end < text.length && keyCharacter.test(text.charAt(end))) end += 1;
  if (end === 0) return { text, count: 0, open: false };
  const masked = `${marker}${lineBreaksOf(text.slice(0, end))}${text.slice(end)}`;
  return { text: masked, count: 1, open: end === text.length };
}

/** Whether the text opens a key block it does not close. */
// RF-141
export function leavesKeyOpen(text: string): boolean {
  const lastIndex = (pattern: RegExp): number =>
    Array.from(text.matchAll(pattern), (match) => match.index).at(-1) ?? -1;
  const begin = lastIndex(beginPattern);
  return begin >= 0 && begin > lastIndex(endPattern);
}

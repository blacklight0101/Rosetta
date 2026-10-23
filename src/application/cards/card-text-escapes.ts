// P5-09 (EV-33): a model that double-escapes its JSON leaves literal escape sequences in the text it
// wrote, such as \u005b for "[". The card text normaliser decodes them before storing. A \uXXXX is
// decoded only when the character is plain text or a newline or tab, never HTML (< > & " ' `) or
// another control character. A literal \n or \t is decoded only after whitespace or sentence
// punctuation, so a Windows path such as C:\temp or folder\new stays as written. Citations are not
// text fields and never pass through here.

const unicodeEscape = /(?<!\\)\\u([0-9a-fA-F]{4})/g;
const lineOrTabEscape = /(^|[\s.!?;,)\]"'])\\([nt])/g;
const htmlChars = '<>&"\'`';

// P5-19: never a backslash (a decoded backslash would start a new escape, so decoding twice would
// differ from decoding once), and never an invisible format or separator character,
// which are U+200B..U+200F (zero-width, direction marks), U+2028..U+202E (separators, bidi embeddings),
// U+2060..U+2064 (word joiner, invisible operators), U+2066..U+206F (isolates, deprecated controls)
// and U+FEFF. Dashes, quotes, the ellipsis and the bullet (U+2010..U+2027) are plain text.
const refusedRanges: readonly (readonly [number, number])[] = [
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x206f],
  [0xfeff, 0xfeff],
];

function isInvisibleOrBackslash(code: number): boolean {
  return code === 0x5c || refusedRanges.some(([from, to]) => code >= from && code <= to);
}

function isDecodable(code: number): boolean {
  if (isInvisibleOrBackslash(code)) return false;
  if (code === 0x09 || code === 0x0a) return true;
  if (code >= 0x20 && code <= 0x7e) return !htmlChars.includes(String.fromCharCode(code));
  return code >= 0xa0 && (code < 0xd800 || code > 0xdfff);
}

/** Decodes the literal escapes a model left in card or claim text; everything else is kept. */
export function decodeTextEscapes(value: string): string {
  return value
    .replace(unicodeEscape, (whole, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return isDecodable(code) ? String.fromCharCode(code) : whole;
    })
    .replace(
      lineOrTabEscape,
      (_whole, lead: string, letter: string) => `${lead}${letter === 'n' ? '\n' : '\t'}`,
    );
}

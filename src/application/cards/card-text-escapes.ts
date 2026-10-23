// P5-09 (EV-33): a model that double-escapes its JSON leaves literal escape sequences in the text it
// wrote, such as \u005b for "[". The card text normaliser decodes them before storing. A \uXXXX is
// decoded only when the character is plain text or a newline or tab, never HTML (< > & " ' `) or
// another control character. A literal \n or \t is decoded only after whitespace or sentence
// punctuation, so a Windows path such as C:\temp or folder\new stays as written. Citations are not
// text fields and never pass through here.

const unicodeEscape = /(?<!\\)\\u([0-9a-fA-F]{4})/g;
const lineOrTabEscape = /(^|[\s.!?;,)\]"'])\\([nt])/g;
const htmlChars = '<>&"\'`';

function isDecodable(code: number): boolean {
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

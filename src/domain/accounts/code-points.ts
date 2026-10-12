// RF-1102, RF-1103: lengths of names and passwords count characters (Unicode code points), as
// PostgreSQL's char_length does, not UTF-16 code units.

/** The number of code points in the text. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

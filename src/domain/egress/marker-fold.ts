// RF-145, ADR-013: the text a data-block marker check reads. A model can take `＜＜＜ＲＯＳＥＴＴＡ-DATA`,
// `‹‹‹END ROSETTA-DATA›››`, a Cyrillic `О` in ROSETTA or a zero-width space inside `<<<` for a frame,
// so the check reads the text folded: every character compatibility-normalised (NFKC: fullwidth and
// small forms, mathematical letters), invisible characters and combining marks dropped, and the
// common look-alikes NFKC keeps (angle quotes and brackets, dashes, Greek, Cyrillic and Cherokee
// letters, small capitals) written as the ASCII they imitate. Folding more than a reader would is
// the safe side: the worst case is a defanged or refused excerpt, never a forged frame.

/** The ASCII a marker is made of, and the characters that imitate it. */
const lookAlikesOf: Readonly<Record<string, string>> = {
  '<': '˂ᐸ‹❮⟨⧼〈',
  '<<': '«≪',
  '<<<': '⋘',
  '-': '˗‐‒–—―⁃−﹘',
  A: 'ΑАᎪᴀ',
  a: 'ɑαа',
  D: 'ԀᎠᴅ',
  d: 'ԁ',
  E: 'ΕЕᎬᴇ',
  e: 'е',
  N: 'Νɴ',
  O: 'ΟОᴏ',
  o: 'οо',
  R: 'ʀᎡᏒ',
  S: 'ЅᏚꜱ',
  s: 'ѕ',
  T: 'ΤТᎢᴛ',
  t: 'т',
};

const asciiOf: ReadonlyMap<string, string> = new Map(
  Object.entries(lookAlikesOf).flatMap(([ascii, chars]) =>
    Array.from(chars, (char) => [char, ascii] as const),
  ),
);

const invisible = /^[\p{M}\p{Cf}\p{Default_Ignorable_Code_Point}]$/u;

export interface MarkerFold {
  /** The folded text. */
  readonly text: string;
  /** For each UTF-16 unit of `text`, where the character it comes from ends in the original. */
  readonly ends: readonly number[];
}

/** One character as a marker check reads it; empty for an invisible one. */
function foldChar(char: string): string {
  if (char.charCodeAt(0) < 0x80) return char;
  return Array.from(char.normalize('NFKC'), (part) =>
    invisible.test(part) ? '' : (asciiOf.get(part) ?? part),
  ).join('');
}

/** Whether the text is plain ASCII, which folds to itself. */
export function isAscii(text: string): boolean {
  return !/[\u0080-\uFFFF]/.test(text);
}

// RF-145
export function foldMarkers(text: string): MarkerFold {
  let folded = '';
  const ends: number[] = [];
  let end = 0;
  for (const char of text) {
    end += char.length;
    const part = foldChar(char);
    folded += part;
    ends.push(...new Array<number>(part.length).fill(end));
  }
  return { text: folded, ends };
}

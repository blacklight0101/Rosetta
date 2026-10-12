import { markerConfusables } from './marker-confusables.js';

// RF-145, ADR-013: the text a data-block marker check reads. A model can take `＜＜＜ＲＯＳＥＴＴＡ-DATA`,
// `‹‹‹END ROSETTA-DATA›››`, a Cyrillic `О` in ROSETTA or a zero-width space inside `<<<` for a frame,
// so the check reads the text folded: every character compatibility-normalised (NFKC: fullwidth and
// small forms, mathematical letters), invisible characters and combining marks dropped, and the
// look-alikes NFKC keeps written as the ASCII they imitate. The look-alikes come from the Unicode
// confusables data (marker-confusables.ts, generated) plus the few multi-character ones below.
//
// The fold is one half of the marker check. It can only know the look-alikes that exist in a table,
// so it is never the only half: marker-keyword.ts refuses a line that spells the marker name with
// any non-ASCII letter left over, whatever stands for the angle brackets. Folding more than a
// reader would is the safe side: the worst case is a defanged or refused excerpt, never a forged
// frame.

/** What a character stands for when it is more than one ASCII character. */
const manyAsciiOf: Readonly<Record<string, string>> = {
  '<<': '\u00ab\u226a',
  '<<<': '\u22d8',
};

function entriesOf(): (readonly [string, string])[] {
  const single = Object.entries(markerConfusables).flatMap(([ascii, points]) =>
    points.map((point) => [String.fromCodePoint(point), ascii] as const),
  );
  const many = Object.entries(manyAsciiOf).flatMap(([ascii, chars]) =>
    Array.from(chars, (char) => [char, ascii] as const),
  );
  return [...single, ...many];
}

const asciiOf: ReadonlyMap<string, string> = new Map(entriesOf());

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
  return !/[\u0080-￿]/.test(text);
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

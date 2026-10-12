import { foldMarkers, isAscii } from './marker-fold.js';

// RF-145, ADR-013: the half of the marker check that does not depend on how the angle brackets are
// spelled. A frame is `<<<` and the marker name; no table of look-alikes can list every symbol that
// could stand for `<`, nor every letter of every script that looks like an `R`. So the check also
// reads the name alone: a line holding a non-ASCII character whose letters, with everything that
// is not a letter or digit left out (spaces, hyphens, underscores, any symbol or punctuation
// outside ASCII), spell ROSETTADATA is a marker attempt, whatever surrounds it. In that spelling a
// non-ASCII letter or any digit may stand for any letter of the name, up to three of its eleven,
// so a look-alike letter nobody listed still reads as the name; the rest must be the exact ASCII
// letters, after the fold of marker-fold.ts. A line of ASCII only is not read here: the exact
// marker is the business of data-block.ts, and ordinary text that says "rosetta data" stays.
//
// What it can still miss is a name written with four or more letters no table knows; such a line
// does not read as the marker to a person or a model either. What it refuses beyond a frame is
// non-ASCII text that spells the name: the worst case is a refused excerpt, never a forged frame.

const NAME = 'ROSETTADATA';
/** Letters of the name that may be unknown (a non-ASCII letter or a digit). */
const MAX_UNKNOWN = 3;
/** Marks a position that stands for any letter. */
const ANY = '?';
/** Written into a line to break the name; it is neither a letter nor a skipped character. */
const BREAK = '|';
/** How many letters of the name stand before the break. */
const BREAK_AFTER = 7;

const lineText = /[^\n\r\u0085\u2028\u2029]+/g;

/** The letters of a folded line as the name is read from them, and where each one ends. */
interface Skeleton {
  readonly letters: readonly string[];
  readonly ends: readonly number[];
}

function letterOf(char: string): string | undefined {
  if (/^[A-Za-z]$/.test(char)) return char.toUpperCase();
  if (/^[\d\p{L}\p{N}]$/u.test(char)) return ANY;
  if (char.charCodeAt(0) < 0x80) return /^[\s_-]$/.test(char) ? undefined : BREAK;
  return undefined;
}

function skeletonOf(line: string): Skeleton {
  const fold = foldMarkers(line);
  const letters: string[] = [];
  const ends: number[] = [];
  let unit = 0;
  for (const char of fold.text) {
    unit += char.length;
    const letter = letterOf(char);
    if (letter === undefined) continue;
    letters.push(letter);
    ends.push(fold.ends[unit - 1] ?? line.length);
  }
  return { letters, ends };
}

function spellsName(letters: readonly string[], start: number): boolean {
  let unknown = 0;
  for (let index = 0; index < NAME.length; index += 1) {
    const letter = letters[start + index];
    if (letter === ANY) unknown += 1;
    else if (letter !== NAME[index]) return false;
  }
  return unknown <= MAX_UNKNOWN;
}

/** Where, in the line, each spelling of the name has its break; none for an ASCII line. */
function breaksIn(line: string): number[] {
  if (isAscii(line)) return [];
  const { letters, ends } = skeletonOf(line);
  const breaks: number[] = [];
  for (let start = 0; start + NAME.length <= letters.length; start += 1) {
    const end = ends[start + BREAK_AFTER - 1];
    if (end !== undefined && spellsName(letters, start)) breaks.push(end);
  }
  return breaks;
}

/** Whether a line of the text, with a non-ASCII character in it, spells the marker name. */
export function holdsMarkerName(text: string): boolean {
  if (isAscii(text)) return false;
  for (const [line] of text.matchAll(lineText)) {
    if (breaksIn(line).length > 0) return true;
  }
  return false;
}

/** The text with a `|` after the seventh letter of every spelling of the marker name. */
export function breakMarkerNames(text: string): string {
  if (isAscii(text)) return text;
  let result = '';
  let position = 0;
  for (const match of text.matchAll(lineText)) {
    const cuts = [...new Set(breaksIn(match[0]))].sort((left, right) => left - right);
    for (const cut of cuts) {
      result += `${text.slice(position, match.index + cut)}${BREAK}`;
      position = match.index + cut;
    }
  }
  return result + text.slice(position);
}

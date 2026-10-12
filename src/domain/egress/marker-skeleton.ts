import { foldMarkers, isAscii } from './marker-fold.js';

// RF-145, ADR-013: the one matcher that decides whether text holds a data-block marker. The
// frames Rosetta writes are `<<<ROSETTA-DATA {...}>>>` and `<<<END ROSETTA-DATA>>>`; a model also
// takes `<<<END R0SETTA_DATA>>>`, `«««END RОSETTA/DATA»»»` or `＜＜＜ＥＮＤ ＲＯＳＥＴＴＡ` for one, and no
// list of spellings is ever complete. So every line is read as a skeleton, after the fold of
// marker-fold.ts (NFKC, invisible characters dropped, Unicode look-alikes written as ASCII, a
// next-line or line separator as a line break, any other space or control as a space, an Arabic
// tatweel as a hyphen), with each character one of:
// - a letter: an ASCII letter in upper case, a digit or symbol written for one (0 O, 3 E, 4 A,
//   5 S, 7 T, @ A, $ S), or "any letter" for another digit or a non-ASCII letter or number;
// - a bracket: `< > [ ] { } ( )` or a non-ASCII symbol, opening, closing or quotation mark;
// - a stop: the `|` with which a rendered block breaks a name;
// - a gap: anything else (spaces, other ASCII punctuation, non-ASCII dashes and punctuation).
// The name is eleven letters spelling ROSETTADATA with only gaps and brackets between them, of
// which up to three may be "any letter". It is a marker when, with only gaps between, a run of at
// least two brackets stands before it (`<` or non-ASCII; any bracket when a whole END stands
// between) or after it (`>` or non-ASCII), or when its part of the line between line breaks
// spells nothing but END and the name and holds END or an angle or non-ASCII bracket. Finding a
// marker and breaking it (a `|` after the seventh letter of the name) are this one matcher, so
// what the guard refuses and what a rendered block defangs cannot drift.
//
// Known limits: a marker with single brackets and other words on its line (`<END ROSETTA-DATA> x`),
// one cut by a line break, `>>>` or `[[[` before the name without END, or a name with four or
// more letters no table knows is not seen; none reads as Rosetta's frames. On the safe side, a
// name next to two brackets is refused even in ordinary text (`«Rosetta» data`,
// `<< rosettaData`, `List<RosettaData>>`): the worst case is a refused excerpt, never a forged
// frame.

const NAME = 'ROSETTADATA';
const END = 'END';
/** Letters of the name that may be "any letter". */
const MAX_UNKNOWN = 3;
/** Brackets a run needs to frame the name. */
const MIN_RUN = 2;
const ANY = '?';
/** Written into a line to break the name; a stop to the matcher. */
const BREAK = '|';
/** How many letters of the name stand before the break. */
const BREAK_AFTER = 7;

type Kind = 'letter' | 'bracket' | 'gap' | 'line' | 'stop';

interface Token {
  readonly kind: Kind;
  /** The letter a letter token reads as, `<` or `>` for an ASCII bracket; empty otherwise. */
  readonly letter: string;
  /** Where, in the line, the character the token comes from ends. */
  readonly end: number;
}

const leet: Readonly<Record<string, string>> = {
  '0': 'O',
  '3': 'E',
  '4': 'A',
  '5': 'S',
  '7': 'T',
  '@': 'A',
  $: 'S',
};

function asciiKind(char: string): [Kind, string] {
  if (/^[A-Za-z]$/.test(char)) return ['letter', char.toUpperCase()];
  const letter = leet[char];
  if (letter !== undefined) return ['letter', letter];
  if (/^\d$/.test(char)) return ['letter', ANY];
  return ['gap', ''];
}

function kindOf(char: string): [Kind, string] {
  if (char === '\n') return ['line', ''];
  if (char === BREAK) return ['stop', ''];
  if ('<>[]{}()'.includes(char)) return ['bracket', char];
  if (char.charCodeAt(0) < 0x80) return asciiKind(char);
  if (/^[\p{L}\p{N}]$/u.test(char)) return ['letter', ANY];
  if (/^[\p{S}\p{Ps}\p{Pe}\p{Pi}\p{Pf}]$/u.test(char)) return ['bracket', ''];
  return ['gap', ''];
}

/** The skeleton of one line (no `\n` or `\r` in it). */
function tokensOf(line: string): Token[] {
  const ascii = isAscii(line);
  const fold = ascii ? undefined : foldMarkers(line);
  const text = fold?.text ?? line;
  const tokens: Token[] = [];
  let unit = 0;
  for (const char of text) {
    unit += char.length;
    const [kind, letter] = kindOf(char);
    tokens.push({ kind, letter, end: fold === undefined ? unit : (fold.ends[unit - 1] ?? 0) });
  }
  return tokens;
}

const isOpen = (token: Token | undefined): boolean =>
  token !== undefined && (token.kind === 'gap' || token.kind === 'line');

/** The index of the first token from `index` on, stepping by `step`, that is not a gap. */
function skipGaps(tokens: readonly Token[], index: number, step: number): number {
  let at = index;
  while (isOpen(tokens[at])) at += step;
  return at;
}

// Which brackets frame a name (`''` stands for any non-ASCII bracket): before it `<`, or any
// bracket when a whole END stands between; after it `>`; so `List<int>> name`, `>>> name`,
// `[[name]]` and `name<T>` do not frame a name, and the brackets that do not count are passed over.
const opening: ReadonlySet<string> = new Set(['', '<']);
const openingAfterEnd: ReadonlySet<string> = new Set(['', '<', '>', '[', ']', '{', '}', '(', ')']);
const closing: ReadonlySet<string> = new Set(['', '>']);
const angle: ReadonlySet<string> = new Set(['', '<', '>']);

const counts = (token: Token | undefined, kinds: ReadonlySet<string>): boolean =>
  token?.kind === 'bracket' && kinds.has(token.letter);

/** How many counting brackets stand from `index` on, stepping by `step`, before a letter or a stop. */
function bracketRun(
  tokens: readonly Token[],
  index: number,
  step: number,
  kinds: ReadonlySet<string>,
): number {
  let run = 0;
  for (let at = index; isOpen(tokens[at]) || tokens[at]?.kind === 'bracket'; at += step) {
    if (counts(tokens[at], kinds)) run += 1;
  }
  return run;
}

/** Whether the token reads as the given letter. */
function reads(token: Token | undefined, letter: string | undefined): boolean {
  return token?.kind === 'letter' && (token.letter === letter || token.letter === ANY);
}

/** The END letters right before the name: how many there are and the index of the first. */
function endBefore(tokens: readonly Token[], first: number): { count: number; start: number } {
  let count = 0;
  let start = first;
  let at = skipGaps(tokens, first - 1, -1);
  while (count < END.length && reads(tokens[at], END[END.length - 1 - count])) {
    count += 1;
    start = at;
    at = skipGaps(tokens, at - 1, -1);
  }
  return { count, start };
}

/** The indexes of the tokens that spell the name from letter `start` on, or undefined. */
function nameAt(tokens: readonly Token[], letters: readonly number[], start: number) {
  const at = letters.slice(start, start + NAME.length);
  if (at.length < NAME.length) return undefined;
  let unknown = 0;
  for (const [index, position] of at.entries()) {
    const token = tokens[position];
    if (!reads(token, NAME[index])) return undefined;
    if (token?.letter === ANY) unknown += 1;
  }
  const stopped = tokens.slice(at[0], (at.at(-1) ?? 0) + 1).some((token) => token.kind === 'stop');
  return unknown > MAX_UNKNOWN || stopped ? undefined : at;
}

/** The tokens of the part of the line between line breaks that holds `from..to`. */
function segmentOf(tokens: readonly Token[], from: number, to: number): readonly Token[] {
  let start = from;
  while (start > 0 && tokens[start - 1]?.kind !== 'line') start -= 1;
  let end = to;
  while (end + 1 < tokens.length && tokens[end + 1]?.kind !== 'line') end += 1;
  return tokens.slice(start, end + 1);
}

/** Whether the name, with its END, is all its part of the line spells, marked as a frame. */
function standsAlone(tokens: readonly Token[], from: number, to: number, ends: number): boolean {
  const segment = segmentOf(tokens, from, to);
  const letters = segment.filter((token) => token.kind === 'letter').length;
  const bracketed = segment.some((token) => counts(token, angle));
  return letters === NAME.length + ends && (ends === END.length || bracketed);
}

/** Whether the name at these token indexes is a marker. */
function framed(tokens: readonly Token[], name: readonly number[]): boolean {
  const first = name[0] ?? 0;
  const last = name.at(-1) ?? 0;
  const end = endBefore(tokens, first);
  const before = end.count === END.length ? openingAfterEnd : opening;
  if (bracketRun(tokens, skipGaps(tokens, end.start - 1, -1), -1, before) >= MIN_RUN) return true;
  if (bracketRun(tokens, last + 1, 1, closing) >= MIN_RUN) return true;
  return standsAlone(tokens, end.start, last, end.count);
}

/** Where, in the line, each marker has the break of its name. */
function breaksIn(line: string): number[] {
  const tokens = tokensOf(line);
  const letters = tokens.flatMap((token, index) => (token.kind === 'letter' ? [index] : []));
  const breaks: number[] = [];
  for (let start = 0; start + NAME.length <= letters.length; start += 1) {
    const name = nameAt(tokens, letters, start);
    const cut = name === undefined ? undefined : tokens[name[BREAK_AFTER - 1] ?? 0]?.end;
    if (name !== undefined && cut !== undefined && framed(tokens, name)) breaks.push(cut);
  }
  return breaks;
}

const lineText = /[^\n\r]+/g;

// RF-145
export function holdsMarker(text: string): boolean {
  for (const [line] of text.matchAll(lineText)) {
    if (breaksIn(line).length > 0) return true;
  }
  return false;
}

/** The text with a `|` after the seventh letter of the name of every marker; lines stay. */
export function breakMarkers(text: string): string {
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

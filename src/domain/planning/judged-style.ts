import type { ArchitectureStyleId } from './catalogue.js';
import { typedAnswers } from './typed-answers.js';

// EV-73, RF-608, DEC-184: the style the components are judged against. With the owner's own answer
// the brief's style is only the default; when the typed text names a catalogue style the check uses
// that style, else the style Rosetta recommended, and only then the default.

interface JudgedSource {
  readonly architecture: {
    readonly style: ArchitectureStyleId;
    readonly recommended: readonly ArchitectureStyleId[];
  };
  readonly defaulted: readonly string[];
  readonly typed?: Readonly<Record<string, string>> | undefined;
}

/** The styles of the catalogue with the title the owner is likely to type. */
export interface NamedStyle {
  readonly id: ArchitectureStyleId;
  readonly title: string;
}

/** The title without a parenthesis: "Layered (N-tier)" is typed as "layered". */
function shortTitle(title: string): string {
  return title.replace(/\s*\(.*\)\s*$/u, '').toLowerCase();
}

/** The words of a text, lower case, with every other character a separator (P8-09: whole words). */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '');
}

/** The ways an owner names a style: the short title, the words of the parenthesis, a hyphenated id. */
function namesOf(style: NamedStyle): string[][] {
  const inside = /\(([^)]*)\)\s*$/u.exec(style.title)?.[1] ?? '';
  const names = [wordsOf(shortTitle(style.title)), wordsOf(inside), wordsOf(style.id)];
  return names.filter((words, index) => words.length > 1 || (index === 0 && words.length === 1));
}

const negators = new Set([
  'not',
  'no',
  'non',
  'never',
  'without',
  'avoid',
  'avoiding',
  't',
  'neither',
  'nor',
]);
const negatingPairs = new Set([
  'instead of',
  'rather than',
  'not a',
  'not an',
  'not the',
  'no more',
]);

/** True when the words at `at` are the phrase, as whole words. */
function phraseAt(words: readonly string[], at: number, phrase: readonly string[]): boolean {
  return phrase.every((word, offset) => words[at + offset] === word);
}

/** "not layered", "without microservices", "instead of layered": the style is named to be refused. */
function refusedAt(words: readonly string[], at: number): boolean {
  const before = words[at - 1];
  if (before !== undefined && negators.has(before)) return true;
  const pair = `${words[at - 2] ?? ''} ${before ?? ''}`;
  return negatingPairs.has(pair);
}

function namedIn(words: readonly string[], style: NamedStyle): boolean {
  return namesOf(style).some((phrase) =>
    words.some((_, at) => phraseAt(words, at, phrase) && !refusedAt(words, at)),
  );
}

/** The catalogue style the owner's typed architecture text names, or undefined when it names none. */
export function namedStyleId(
  brief: JudgedSource,
  styles: readonly NamedStyle[],
): ArchitectureStyleId | undefined {
  const own = typedAnswers(brief).architecture;
  if (own === undefined) return undefined;
  const words = wordsOf(own);
  return [...styles]
    .sort((a, b) => shortTitle(b.title).length - shortTitle(a.title).length)
    .find((style) => namedIn(words, style))?.id;
}

/**
 * The style the dependency check and the component roles follow. The owner's text names a style when
 * the style's own words stand in it, whole words only ("clean separation" names none), and not after
 * a refusal ("not layered" names none); then the style Rosetta recommended, then the default.
 */
export function judgedStyleId(
  brief: JudgedSource,
  styles: readonly NamedStyle[],
): ArchitectureStyleId {
  if (typedAnswers(brief).architecture === undefined) return brief.architecture.style;
  return (
    namedStyleId(brief, styles) ?? brief.architecture.recommended[0] ?? brief.architecture.style
  );
}

/**
 * P8-09: what the style the checks compare with is called, true for each of the three ways it is
 * found: the style the answer names, the style Rosetta recommended, or the default style.
 */
export function styleReferenceKind(brief: JudgedSource, judged: NamedStyle): string {
  if (namedStyleId(brief, [judged]) !== undefined) return 'the catalogue style the answer names';
  return brief.architecture.recommended[0] === judged.id
    ? 'the style Rosetta recommended'
    : 'the default style';
}

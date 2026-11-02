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

/** A word without a plain plural: "microservices" and "microservice" are one word. */
function stem(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

/**
 * The words of a clause, lower case; an apostrophe is dropped ("don't" is "dont") and a hyphen stays
 * inside its word, so "pre-layered" is one word that is not "layered" (P8-09: whole words).
 */
function wordsOf(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\b(anything|everything|all|any|anyone|everyone|nothing|none)\s+but\b/giu, '$1 except')
    .split(/[^\p{L}\p{N}-]+/u)
    .map((word) => word.replace(/^-+|-+$/gu, ''))
    .filter((word) => word !== '');
}

/** The clauses of a text: a sentence end, a comma, a semicolon or a "but" ends the reach of a negation. */
function clausesOf(text: string): string[][] {
  return text
    .replace(/\b(anything|everything|all|any|anyone|everyone|nothing|none)\s+but\b/giu, '$1 except')
    .split(/[.,;:!?\n]+|\b(?:but|however|yet|although|though|whereas|while)\b/iu)
    .map(wordsOf)
    .filter((words) => words.length > 0);
}

/** Words other than the title an owner uses for one style ("layers" for layered). */
const aliases: Readonly<Record<string, readonly string[]>> = { layered: ['layer'] };

/** The ways an owner names a style: the short title, the words of the parenthesis, the id; each stemmed. */
function namesOf(style: NamedStyle): string[][] {
  const inside = /\(([^)]*)\)\s*$/u.exec(style.title)?.[1] ?? '';
  const spelled = [shortTitle(style.title), inside, style.id].flatMap((name) => [
    wordsOf(name),
    wordsOf(name.replaceAll('-', ' ')),
  ]);
  const alias = (aliases[style.id] ?? []).map((word) => [word]);
  return [...spelled, ...alias].filter((words) => words.length > 0).map((words) => words.map(stem));
}

/**
 * The only words that may stand beside a style name for the clause to count as choosing it. Any other
 * word ("not", "bad", "tired", "were", "separation") makes the clause say something else, so it picks
 * nothing: a wrong pick is worse than none, and the recommendation applies.
 */
const affirmative = new Set([
  ...['use', 'uses', 'using', 'used', 'we', 'i', 'our', 'want', 'wants', 'would', 'like', 'will'],
  ...['go', 'going', 'with', 'choose', 'chose', 'prefer', 'please', 'pls', 'maybe', 'lets', 'let'],
  ...['keep', 'stay', 'a', 'an', 'the', 'architecture', 'style', 'approach', 'pattern', 'design'],
  ...['to', 'be', 'should', 'adopt', 'take', 'pick', 'select', 'yes', 'ok', 'okay', 'so', 'then'],
  ...['just', 'simply', 'probably'],
]);

/** True when the words at `at` are the phrase, as whole (stemmed) words. */
function phraseAt(words: readonly string[], at: number, phrase: readonly string[]): boolean {
  return phrase.every((word, offset) => stem(words[at + offset] ?? '') === word);
}

/** The clause is the style name and only affirmative filler. */
function choosesAt(words: readonly string[], at: number, length: number): boolean {
  return words.every(
    (word, index) => (index >= at && index < at + length) || affirmative.has(word),
  );
}

function namedIn(clauses: readonly (readonly string[])[], style: NamedStyle): boolean {
  const names = namesOf(style);
  return clauses.some((words) =>
    names.some((phrase) =>
      words.some((_, at) => phraseAt(words, at, phrase) && choosesAt(words, at, phrase.length)),
    ),
  );
}

/** The catalogue style the owner's typed architecture text names, or undefined when it names none. */
export function namedStyleId(
  brief: JudgedSource,
  styles: readonly NamedStyle[],
): ArchitectureStyleId | undefined {
  const own = typedAnswers(brief).architecture;
  if (own === undefined) return undefined;
  const clauses = clausesOf(own);
  return [...styles]
    .sort((a, b) => shortTitle(b.title).length - shortTitle(a.title).length)
    .find((style) => namedIn(clauses, style))?.id;
}

/**
 * The style the dependency check and the component roles follow. The owner's text names a style when
 * a clause of it is the style's name and only affirmative filler ("we want layered"; "clean separation",
 * "not layered" and "layered is bad" name none); then the style Rosetta recommended, then the default.
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

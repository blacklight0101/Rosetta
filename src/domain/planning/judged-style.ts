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
    .replace(/['’]/gu, '')
    .replace(/\b(anything|everything|all|any|anyone|everyone|nothing|none)\s+but\b/giu, '$1 except')
    .split(/[^\p{L}\p{N}-]+/u)
    .map((word) => word.replace(/^-+|-+$/gu, ''))
    .filter((word) => word !== '');
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
  ...['use', 'uses', 'using', 'we', 'i', 'our', 'want', 'wants', 'would', 'like', 'will'],
  ...['go', 'going', 'with', 'choose', 'prefer', 'please', 'pls', 'lets', 'let'],
  ...['keep', 'stay', 'a', 'an', 'the', 'architecture', 'style', 'approach', 'pattern', 'design'],
  ...['to', 'be', 'should', 'adopt', 'take', 'pick', 'select', 'yes', 'ok', 'okay', 'so', 'then'],
  ...['just', 'simply'],
]);

/** After the style name only these may follow: a politeness, or a word that belongs to the name ("layered design"). */
const afterName = new Set([
  'please',
  'pls',
  'architecture',
  'style',
  'approach',
  'pattern',
  'design',
]);

/** The length of the style name that starts at `at`, or 0. */
function nameLengthAt(words: readonly string[], at: number, names: readonly string[][]): number {
  const found = names.filter((phrase) =>
    phrase.every((word, offset) => stem(words[at + offset] ?? '') === word),
  );
  return Math.max(0, ...found.map((phrase) => phrase.length));
}

/**
 * The catalogue style the owner's typed architecture text names, or undefined. The whole answer is
 * judged: it names a style only when it is the name of one style, with affirmative filler before it
 * and only a politeness or a word of the name after it ("let layered go" and "layered?!" name none).
 * Any other word ("not", "bad", "separation", "replaced"), wherever it stands, or a second style makes
 * it name none: a wrong pick is worse than none, and the recommendation applies instead.
 */
export function namedStyleId(
  brief: JudgedSource,
  styles: readonly NamedStyle[],
): ArchitectureStyleId | undefined {
  const own = typedAnswers(brief).architecture;
  if (own === undefined || /[?!]/u.test(own)) return undefined;
  const words = wordsOf(own);
  const names = styles.map((style) => ({ id: style.id, names: namesOf(style) }));
  const named = new Set<ArchitectureStyleId>();
  let at = 0;
  while (at < words.length) {
    const hits = names
      .map((style) => ({ id: style.id, length: nameLengthAt(words, at, style.names) }))
      .filter((hit) => hit.length > 0);
    const longest = Math.max(0, ...hits.map((hit) => hit.length));
    const word = words[at] ?? '';
    if (longest === 0 && !(named.size === 0 ? affirmative : afterName).has(word)) return undefined;
    hits.filter((hit) => hit.length === longest).forEach((hit) => named.add(hit.id));
    at += Math.max(1, longest);
  }
  const [only] = named;
  return named.size === 1 ? only : undefined;
}

/**
 * The style the dependency check and the component roles follow. The owner's text names a style when
 * the whole answer is one style's name and only affirmative filler ("we want layered"; "clean separation",
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

import type { SourceCard } from './plan-sources.js';

// P5-43, RF-602, ADR-013: the words, values and roles of the texts the claim meaning check reads.
// Every text is cut to a bound before it is read.

export const MAX_TEXT = 2000;

export function wordsOf(text: string): string[] {
  return [
    ...text
      .slice(0, MAX_TEXT)
      .toLowerCase()
      .matchAll(/[\p{L}\p{N}]+/gu),
  ].map((match) => match[0]);
}

const numberPattern = /(?<![\p{L}\p{N}-])\d+(?:[.,]\d+)?(?![\p{L}\p{N}-])/gu;
const quotedPattern = /"([^"\n]{2,40})"|“([^”\n]{2,40})”/gu;

export function valuesOf(text: string): string[] {
  const cut = text.slice(0, MAX_TEXT);
  const numbers = [...cut.matchAll(numberPattern)].map((match) => match[0]);
  const quoted = [...cut.matchAll(quotedPattern)].map((match) =>
    (match[1] ?? match[2] ?? '').toLowerCase(),
  );
  return [...new Set([...numbers, ...quoted])];
}

export function statesValue(corpus: string, value: string): boolean {
  if (!/^\d/u.test(value)) return corpus.includes(value);
  return corpus
    .split(/[^\p{L}\p{N}.,-]+/u)
    .some((token) => token.replace(/[.,-]+$/u, '') === value);
}

function normalWord(word: string): string {
  return word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word;
}

/** Every word of the supported cards (titles, summaries, claims and screen roles), by its first five letters. */
export function prefixesOf(sources: readonly SourceCard[]): Set<string> {
  const found = new Set<string>();
  for (const card of sources) {
    const texts = [
      card.title,
      card.summary,
      ...card.claims.map((claim) => claim.text),
      ...(card.screen?.roles ?? []),
    ];
    for (const text of texts) {
      for (const word of wordsOf(text)) found.add(normalWord(word).slice(0, 5));
    }
  }
  return found;
}

export function roleStated(name: string, prefixes: ReadonlySet<string>): boolean {
  const words = wordsOf(name).map(normalWord);
  return words.length === 0 || words.every((word) => prefixes.has(word.slice(0, 5)));
}

export function namesRole(text: string, role: string): boolean {
  const words = new Set(wordsOf(text).map(normalWord));
  const own = wordsOf(role).map(normalWord);
  return own.length > 0 && own.every((word) => words.has(word));
}

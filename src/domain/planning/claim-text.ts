import type { ClaimVerbs } from './claim-verbs.js';
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

/** The words of `claim` stand a role name: it opens the claim, or stands within three words of a cue. */
function claimStatesRole(
  claim: string,
  role: readonly string[],
  cues: ReadonlySet<string>,
): boolean {
  const words = wordsOf(claim).map(normalWord);
  const first = role[0];
  if (first === undefined) return false;
  return words.some((word, at) => {
    if (word !== first || !role.every((each, step) => words[at + step] === each)) return false;
    if (at < 4) return true;
    const near = words.slice(Math.max(0, at - 3), at + role.length + 3);
    return near.some((other) => cues.has(other));
  });
}

/**
 * A role is stated when a screen card lists it, or a Supported claim states it as a role: the name opens
 * the claim, or stands within three words of a cue of the catalogue ("only a manager may ...", "the role
 * ..."). A name that only appears somewhere in a card ("seeds one administrator account") states nothing.
 */
export function roleStated(
  name: string,
  sources: readonly SourceCard[],
  verbs: ClaimVerbs,
): boolean {
  const role = wordsOf(name).map(normalWord);
  if (role.length === 0) return true;
  const cues = new Set(verbs.roleCues);
  return sources.some(
    (card) =>
      (card.screen?.roles ?? []).some(
        (each) => wordsOf(each).map(normalWord).join(' ') === role.join(' '),
      ) || card.claims.some((claim) => claimStatesRole(claim.text, role, cues)),
  );
}

export function namesRole(text: string, role: string): boolean {
  const words = new Set(wordsOf(text).map(normalWord));
  const own = wordsOf(role).map(normalWord);
  return own.length > 0 && own.every((word) => words.has(word));
}

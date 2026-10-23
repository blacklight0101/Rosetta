import type { ClaimStatus } from './card-vocabulary.js';
import { formatCitation, type Citation } from './citation.js';
import type { Card, Claim, ClaimInput } from './card.js';

// P3-125, RF-209, RF-302, DEC-19, HB-06: a Deepen round that writes a claim a card already holds adds
// no near-duplicate. Two claims state the same thing when one of their cited ranges overlaps (same
// file, a line in common) and either their text is the same once case, punctuation and spacing are
// ignored, or their words are nearly the same (Jaccard index of 0.8) and all of these hold, because a
// claim that differs in a name says something else: they agree on negation and on every number; they
// name the same identifiers in the same order of first appearance (a field, column or class name: it
// has an underscore, a digit, an inner capital, a dot or `::`, or it is quoted; the first one is the
// subject); and no word that differs is a capitalised word inside a sentence ("Column Name" and
// "Column Price"). A claim the card holds whose verdict stands (`Proposed`, `Supported`,
// `Unverified`) takes the new claim's other citations and keeps its verdict. A `Rejected` claim is
// never changed or removed: a restatement with a new citation is added as the claim that replaces it;
// a restatement of the evidence it was rejected for says nothing new and is left out.

/** What becomes of one claim a Deepen task wrote for a card. */
export type Restatement =
  | { readonly kind: 'add'; readonly input: ClaimInput }
  | { readonly kind: 'fold'; readonly claimId: string }
  | { readonly kind: 'rejected-again'; readonly claimId: string }
  | { readonly kind: 'replaces-rejected'; readonly input: ClaimInput; readonly claimId: string };

const STANDING: readonly ClaimStatus[] = ['Proposed', 'Supported', 'Unverified'];

/** The text without case, punctuation and spacing; empty when it holds no letter or digit. */
function normalisedText(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/n['’]t(?![a-z])/gu, ' not')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

const NEGATIONS: ReadonlySet<string> = new Set(['not', 'no', 'never', 'without', 'cannot', 'none']);
/** P3-125: how much of their words two claims share to be the same claim (Jaccard index). */
const SIMILARITY = 0.8;

function wordsOf(normalised: string): ReadonlySet<string> {
  return new Set(normalised.split(' '));
}

function pick(words: ReadonlySet<string>, keep: (word: string) => boolean): string {
  return [...words].filter(keep).sort().join(' ');
}

const CHUNK = /`[^`]+`|"[^"]+"|(?<![\p{L}\p{N}])'[^']+'(?![\p{L}\p{N}])|\S+/gu;
const IDENTIFIER = /_|\p{N}|\p{Ll}\p{Lu}|[\p{L}\p{N}]\.[\p{L}\p{N}]|::/u;
const EDGES = /^[^\p{L}\p{N}_]+|[^\p{L}\p{N}_]+$/gu;

/** The identifier-like words of a claim as written, in order of first appearance (quoted text too). */
function identifiersOf(text: string): string {
  const found = (text.match(CHUNK) ?? []).flatMap((chunk) => {
    const quoted = /^[`"']/u.test(chunk);
    const word = chunk.replace(EDGES, '');
    return quoted || IDENTIFIER.test(word) ? [word.toLowerCase()] : [];
  });
  return [...new Set(found)].join(' ');
}

/** The words that are capitalised in the text and do not start a sentence, as the claim is normalised. */
function namesOf(text: string): ReadonlySet<string> {
  const names = new Set<string>();
  let starts = true;
  for (const raw of text.split(/\s+/u)) {
    const word = raw.replace(EDGES, '');
    if (!starts && /^\p{Lu}/u.test(word))
      normalisedText(word)
        .split(' ')
        .forEach((n) => names.add(n));
    starts = /[.!?:]$/u.test(raw);
  }
  return names;
}

/** Nearly the same words (Jaccard >= 0.8) with the same negation, numbers, identifiers and names. */
function nearlySame(a: ClaimInput['text'], b: ClaimInput['text']): boolean {
  const [one, two] = [wordsOf(normalisedText(a)), wordsOf(normalisedText(b))];
  const shared = [...one].filter((word) => two.has(word)).length;
  if (shared / (one.size + two.size - shared) < SIMILARITY) return false;
  const negation = (word: string): boolean => NEGATIONS.has(word);
  const number = (word: string): boolean => /\p{N}/u.test(word);
  const negates = (words: ReadonlySet<string>): boolean => [...words].some(negation);
  const names = new Set([...namesOf(a), ...namesOf(b)]);
  const differs = [...one, ...two].filter((word) => one.has(word) !== two.has(word));
  return (
    negates(one) === negates(two) &&
    pick(one, number) === pick(two, number) &&
    identifiersOf(a) === identifiersOf(b) &&
    !differs.some((word) => names.has(word))
  );
}

function overlap(a: Citation, b: Citation): boolean {
  return a.path === b.path && a.startLine <= b.endLine && b.startLine <= a.endLine;
}

function sharesLines(a: readonly Citation[], b: readonly Citation[]): boolean {
  return a.some((one) => b.some((other) => overlap(one, other)));
}

/** The claim of `claims` with the same words as `input` and the given statuses, the exact words first. */
function same(
  claims: readonly Claim[],
  input: ClaimInput,
  where: { readonly statuses: readonly ClaimStatus[]; readonly overlapping: boolean },
): Claim | undefined {
  const text = normalisedText(input.text);
  const candidates = claims.filter(
    (claim) =>
      where.statuses.includes(claim.status) &&
      sharesLines(claim.citations, input.citations) === where.overlapping,
  );
  const exact = candidates.find((claim) => text !== '' && normalisedText(claim.text) === text);
  return (
    exact ??
    (text === '' ? undefined : candidates.find((claim) => nearlySame(claim.text, input.text)))
  );
}

/**
 * RF-300: whether a citation names a file of the code map (`lines`: path to line count) and a range
 * inside it; the same test as the citation check, applied to a citation folded into a claim.
 */
export function citationHolds(citation: Citation, lines: ReadonlyMap<string, number>): boolean {
  const { path, startLine, endLine } = citation;
  const count = lines.get(path);
  const whole = Number.isInteger(startLine) && Number.isInteger(endLine);
  return count !== undefined && whole && startLine >= 1 && endLine >= startLine && endLine <= count;
}

/** What the card's claims make of a claim a Deepen task wrote for it. */
// RF-209
export function restate(claims: readonly Claim[], input: ClaimInput): Restatement {
  const standing = same(claims, input, { statuses: STANDING, overlapping: true });
  if (standing !== undefined) return { kind: 'fold', claimId: standing.claimId };
  const rejected = claims.filter((claim) => claim.status === 'Rejected');
  const again = same(rejected, input, { statuses: ['Rejected'], overlapping: true });
  if (again !== undefined) return { kind: 'rejected-again', claimId: again.claimId };
  const old = same(rejected, input, { statuses: ['Rejected'], overlapping: false });
  const answered = old !== undefined && claims.some((claim) => claim.replaces === old.claimId);
  if (old === undefined || answered || input.replaces !== undefined) return { kind: 'add', input };
  return {
    kind: 'replaces-rejected',
    input: { ...input, replaces: old.claimId },
    claimId: old.claimId,
  };
}

/** The card with the citations of `input` that the claim lacks added to it; its verdict stays. */
export function foldInto(card: Card, claimId: string, input: ClaimInput): Card {
  const claims = card.claims.map((claim): Claim => {
    if (claim.claimId !== claimId) return claim;
    const seen = new Set(claim.citations.map(formatCitation));
    const added = input.citations.filter((citation) => !seen.has(formatCitation(citation)));
    const replaces = claim.replaces ?? input.replaces;
    return {
      ...claim,
      citations: [...claim.citations, ...added],
      ...(replaces === undefined ? {} : { replaces }),
    };
  });
  return { ...card, claims };
}

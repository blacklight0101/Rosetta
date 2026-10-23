import type { ClaimStatus } from './card-vocabulary.js';
import { formatCitation, type Citation } from './citation.js';
import type { Card, Claim, ClaimInput } from './card.js';

// P3-125, RF-209, RF-302, DEC-19, HB-06: a Deepen round that writes a claim a card already holds adds
// no near-duplicate. Two claims state the same thing when their text is the same once case,
// punctuation and spacing are ignored and one of their cited ranges overlaps (same file, a line
// in common). A claim the card holds whose verdict stands (`Proposed`, `Supported`, `Unverified`)
// takes the new claim's other citations and keeps its verdict. A `Rejected` claim is never changed or
// removed: a restatement with a new citation is added as the claim that replaces it; a restatement
// of the evidence it was rejected for says nothing new and is left out.

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
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function overlap(a: Citation, b: Citation): boolean {
  return a.path === b.path && a.startLine <= b.endLine && b.startLine <= a.endLine;
}

function sharesLines(a: readonly Citation[], b: readonly Citation[]): boolean {
  return a.some((one) => b.some((other) => overlap(one, other)));
}

/** The claim of `claims` with the same words as `input` and the given statuses, by overlap or not. */
function same(
  claims: readonly Claim[],
  input: ClaimInput,
  where: { readonly statuses: readonly ClaimStatus[]; readonly overlapping: boolean },
): Claim | undefined {
  const text = normalisedText(input.text);
  if (text === '') return undefined;
  return claims.find(
    (claim) =>
      where.statuses.includes(claim.status) &&
      normalisedText(claim.text) === text &&
      sharesLines(claim.citations, input.citations) === where.overlapping,
  );
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

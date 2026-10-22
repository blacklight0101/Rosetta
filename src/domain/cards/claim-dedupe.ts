import type { ClaimStatus } from './card-vocabulary.js';
import { formatCitation, type Citation } from './citation.js';

// P3-106, RF-230, EV-05: a claim text that a card holds twice is kept once. Two claims are the same
// when their text, status, target and the claim they replace are the same; a Rejected claim is
// never folded into a Supported one with the same words (RF-302), and a flow's steps are never
// folded by the card that makes them (a step may repeat). A copy that is not judged yet brings its
// cited lines to the kept claim, so the judgement sees every range the agent gave; a judged claim
// keeps the lines its verdict was about.

interface Foldable {
  readonly text: string;
  readonly citations: readonly Citation[];
  readonly status?: ClaimStatus;
  readonly target?: string | undefined;
  readonly replaces?: string | undefined;
}

export interface Collapsed<T> {
  readonly kept: readonly T[];
  /** For each claim given, the index in `kept` of the claim that stands for it. */
  readonly keptIndex: readonly number[];
}

function keyOf(claim: Foldable): string {
  const { text, status = 'Proposed', target = '', replaces = '' } = claim;
  return JSON.stringify([text.trim(), status, target, replaces]);
}

function withLinesOf<T extends Foldable>(claim: T, copies: readonly T[]): T {
  if ((claim.status ?? 'Proposed') !== 'Proposed') return claim;
  const seen = new Set<string>();
  const citations = copies
    .flatMap((copy) => copy.citations)
    .filter((citation) => {
      const key = formatCitation(citation);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  return { ...claim, citations };
}

/** The claims with the repeated ones taken out, and where each given claim went. */
// RF-230
export function collapseClaims<T extends Foldable>(claims: readonly T[]): Collapsed<T> {
  const groups = new Map<string, T[]>();
  const keptIndex = claims.map((claim) => {
    const key = keyOf(claim);
    const group = groups.get(key) ?? [];
    if (group.length === 0) groups.set(key, group);
    group.push(claim);
    return [...groups.keys()].indexOf(key);
  });
  const kept = [...groups.values()].flatMap((group) => {
    const [first] = group;
    return first === undefined ? [] : [withLinesOf(first, group)];
  });
  return { kept, keptIndex };
}

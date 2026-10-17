import type { CardType, ClaimStatus } from '../cards/card-vocabulary.js';
import type { Citation } from '../cards/citation.js';
import type { GoldenAbsence, GoldenFinding } from './golden-set.js';

// RNF-006, RNF-015, DEC-57: how one claim of a run is compared with the golden set. The comparison
// is mechanical and the same every time: lines, card types and words, never a model. It shows
// that a claim found the right thing in the right place; it does not re-judge the claim (the
// verifier did that), so a claim it cannot place is listed as unmatched for a person to check.

/** A claim of a run as the evaluation reads it from the card files. */
export interface EvaluatedClaim {
  readonly claimId: string;
  readonly cardType: CardType;
  readonly cardTitle: string;
  readonly text: string;
  readonly status: ClaimStatus;
  readonly citations: readonly Citation[];
}

/** Same file and at least one line in common. */
function overlaps(left: Citation, right: Citation): boolean {
  return (
    left.path === right.path && left.startLine <= right.endLine && right.startLine <= left.endLine
  );
}

/** The card title and the claim text, lower case, which the words of the golden set are read in. */
function wordsOf(claim: EvaluatedClaim): string {
  return `${claim.cardTitle}\n${claim.text}`.toLowerCase();
}

function holds(words: string, word: string): boolean {
  return words.includes(word.toLowerCase());
}

// RNF-006
export function matchesFinding(claim: EvaluatedClaim, finding: GoldenFinding): boolean {
  if (finding.cardTypes.length > 0 && !finding.cardTypes.includes(claim.cardType)) return false;
  const cited = claim.citations.some((citation) =>
    finding.evidence.some((evidence) => overlaps(citation, evidence)),
  );
  if (!cited) return false;
  const words = wordsOf(claim);
  return finding.keywords.some((keyword) => holds(words, keyword));
}

// RNF-015, DEC-57
export function hitsAbsence(claim: EvaluatedClaim, absence: GoldenAbsence): boolean {
  const words = wordsOf(claim);
  if (absence.unless.some((word) => holds(words, word))) return false;
  return absence.claimPatterns.some((pattern) => pattern.every((word) => holds(words, word)));
}

/** True when the claim cites at least one of the paths. */
export function citesAnyPath(claim: EvaluatedClaim, paths: ReadonlySet<string>): boolean {
  return claim.citations.some((citation) => paths.has(citation.path));
}

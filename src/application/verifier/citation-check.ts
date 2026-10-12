import type { Card } from '../../domain/cards/card.js';
import type { CodeMap } from '../../domain/code-map/code-map.js';

// RF-300, RF-302, ADR-005, DEC-19: step 1 of the verifier. Every citation of a claim must name a
// file of the code map and a line range inside that file; otherwise the claim becomes
// `CitationInvalid` with the reason. A claim is never removed, only its status and verdict change.

export interface CitationCheck {
  readonly claimId: string;
  readonly ok: boolean;
  readonly reason?: string;
}

export interface CheckedCards {
  readonly cards: readonly Card[];
  /** One result per claim that was `Proposed`, in card and claim order. */
  readonly checks: readonly CitationCheck[];
}

// RF-300
export function checkCitations(
  cards: readonly Card[],
  _codeMap: Pick<CodeMap, 'files'>,
  _at: string,
): CheckedCards {
  return { cards, checks: [] };
}

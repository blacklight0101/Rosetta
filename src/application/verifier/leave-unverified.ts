import { transitionClaim, type Card, type ClaimVerdict } from '../../domain/cards/card.js';

// RF-304, RF-006, DEC-13: when a cap stops a run, the claims not yet judged are left `Unverified`
// so that a resume can judge them. A claim is never removed, only its status and verdict change;
// a claim with a final status (`CitationInvalid`, `Supported`, `Rejected`) keeps it, and one that
// is already `Unverified` keeps the verdict it was left with.

/** The name the verdict of this step carries where the judgement step names its model. */
export const CAP_STOPPED_MODEL = 'run-stopped';

function verdictAt(at: string): ClaimVerdict {
  return {
    step: 'judgement',
    reason: 'The run stopped at its cap before this claim was judged.',
    model: CAP_STOPPED_MODEL,
    at,
  };
}

// RF-304
export function leaveUnverified(cards: readonly Card[], at: string): readonly Card[] {
  return cards.map((card) =>
    card.claims.reduce((current, claim) => {
      if (claim.status !== 'Proposed') return current;
      const moved = transitionClaim(current, claim.claimId, 'Unverified', verdictAt(at));
      return moved.ok ? moved.value : current;
    }, card),
  );
}

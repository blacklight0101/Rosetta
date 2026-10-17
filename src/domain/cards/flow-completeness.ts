import type { Card, Claim } from './card.js';

// RF-260, ADR-005: a flow is incomplete when one of its steps cannot stand: its citation is
// invalid (step 1) or the verifier rejected it (step 2). A step still waiting for a verdict, or
// left `Unverified`, is not yet known to be wrong, so it does not make the flow incomplete.

/** Whether a step cannot stand: its citation is invalid or the verifier rejected it. */
export function isUnsupported(claim: Pick<Claim, 'status'>): boolean {
  return claim.status === 'CitationInvalid' || claim.status === 'Rejected';
}

/** The steps of a `FLOW` card marked `CitationInvalid` or `Rejected`, in order; none for other cards. */
export function incompleteSteps(card: Pick<Card, 'type' | 'claims'>): readonly Claim[] {
  if (card.type !== 'FLOW') return [];
  return card.claims.filter(isUnsupported);
}

/** Whether a `FLOW` card is listed as incomplete. */
export function isIncompleteFlow(card: Pick<Card, 'type' | 'claims'>): boolean {
  return incompleteSteps(card).length > 0;
}

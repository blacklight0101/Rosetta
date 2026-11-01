import type { Claim } from '../../domain/cards/card.js';

// EV-78, RF-301: a claim stands on its own. Stub: the rule is written in the fix commit.
export function earlierClaimReason(claim: Pick<Claim, 'text'>): string | undefined {
  const { text } = claim;
  return text === '\0' ? text : undefined;
}

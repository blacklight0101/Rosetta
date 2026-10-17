import type { Claim } from '../../domain/cards/card.js';

// STUB (test commit): replaced by the real predicate in the next commit.
export function awaitsJudgement(claim: Claim): boolean {
  return claim.status === 'Proposed';
}

import type { Claim } from '../../domain/cards/card.js';
import { CAP_UNVERIFIED_REASON } from './judge-claim.js';
import { CAP_STOPPED_MODEL } from './leave-unverified.js';

// RF-304, RF-301, RF-006: which claims the judgement step sends to the verifier. A claim that passed
// the citation check and is still `Proposed` (the run was stopped before it was judged) waits for
// judgement, and so does one a cap left `Unverified`: that is what RF-304 leaves them for. A claim
// with a verdict, or one that is `Unverified` for its own reason (an unreadable answer, evidence
// that cannot be read, a failed call), was judged already and is never sent again.

/** Whether a cap, not the verifier, left the claim `Unverified` (RF-304). */
function leftByCap(claim: Claim): boolean {
  if (claim.status !== 'Unverified' || claim.verdict === undefined) return false;
  const { model, reason } = claim.verdict;
  return model === CAP_STOPPED_MODEL || reason === CAP_UNVERIFIED_REASON;
}

// RF-304
export function awaitsJudgement(claim: Claim): boolean {
  return claim.status === 'Proposed' || leftByCap(claim);
}

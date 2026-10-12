import type { ClaimStatus } from './card-vocabulary.js';

// Architecture section 5: `Proposed` -> `CitationInvalid` (step 1) / `Supported` / `Rejected`
// (step 2) / `Unverified` (stopped); `Unverified` -> `Supported` / `Rejected` (resumed). The other
// three statuses are final (RF-302: a claim is never removed, only its status changes).

const TRANSITIONS: Readonly<Record<ClaimStatus, readonly ClaimStatus[]>> = {
  Proposed: ['CitationInvalid', 'Supported', 'Rejected', 'Unverified'],
  Unverified: ['Supported', 'Rejected'],
  CitationInvalid: [],
  Supported: [],
  Rejected: [],
};

export function canTransitionClaim(from: ClaimStatus, to: ClaimStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

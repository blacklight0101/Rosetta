import type { RunEvent } from '../../api/run-events.js';
import { cardData, citationCheckedData, claimJudgedData } from './event-data.js';
import type { ClaimRow, ClaimShown, RunState } from './run-state.js';

// RF-1004, DEC-103: what the events of a claim change in the claims list. A claim is `Proposed`
// when its card appears, `AwaitingModel` when it passed the citation check (the model step of the
// verifier is not built yet, so nothing moves it further in this release), `CitationInvalid` when
// the check failed, and `Supported`, `Rejected` or `Unverified` when a verdict arrives. Nothing is
// ever removed from the list.

const VERDICTS: readonly ClaimShown[] = ['Supported', 'Rejected', 'Unverified'];

/** `BR-004.c2` belongs to card `BR-004`. */
function cardOf(claimId: string): string {
  return claimId.replace(/\.c\d+$/u, '');
}

function blankClaim(claimId: string): ClaimRow {
  return {
    claimId,
    cardId: cardOf(claimId),
    text: undefined,
    citations: [],
    status: 'Proposed',
    reason: undefined,
  };
}

/** The state with that claim changed, the claim added at the end when it is not listed yet. */
function withClaim(
  state: RunState,
  claimId: string,
  change: (claim: ClaimRow) => ClaimRow,
): RunState {
  const known = state.claims.some((claim) => claim.claimId === claimId);
  const claims = known ? state.claims : [...state.claims, blankClaim(claimId)];
  return {
    ...state,
    claims: claims.map((claim) => (claim.claimId === claimId ? change(claim) : claim)),
  };
}

/** A card that announces `claims` claims lists them as proposed, `<card>.c1` to `<card>.c<n>`. */
// RF-1004
export function onClaimsProposed(state: RunState, event: RunEvent): RunState {
  const parsed = cardData.safeParse(event.data);
  if (!parsed.success) return state;
  const { cardId, claims = 0 } = parsed.data;
  let next = state;
  for (let number = 1; number <= Math.min(claims, 200); number += 1) {
    const claimId = `${cardId}.c${String(number)}`;
    if (!next.claims.some((claim) => claim.claimId === claimId)) {
      next = { ...next, claims: [...next.claims, blankClaim(claimId)] };
    }
  }
  return next;
}

// RF-1004, DEC-103
export function onCitationChecked(state: RunState, event: RunEvent): RunState {
  const parsed = citationCheckedData.safeParse(event.data);
  if (!parsed.success) return state;
  const { claimId, ok, reason, text, citations } = parsed.data;
  return withClaim(state, claimId, (claim) => ({
    ...claim,
    text: text ?? claim.text,
    citations: citations ?? claim.citations,
    status: ok ? 'AwaitingModel' : 'CitationInvalid',
    reason: ok ? undefined : reason,
  }));
}

// RF-1004
export function onClaimJudged(state: RunState, event: RunEvent): RunState {
  const parsed = claimJudgedData.safeParse(event.data);
  if (!parsed.success) return state;
  const { claimId, status, reason } = parsed.data;
  const verdict = VERDICTS.find((each) => each === status);
  if (verdict === undefined) return state;
  return withClaim(state, claimId, (claim) => ({ ...claim, status: verdict, reason }));
}

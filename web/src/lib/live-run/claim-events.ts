import type { RunEvent } from '../../api/run-events.js';
import { cardData, cardsMergedData, citationCheckedData, claimJudgedData } from './event-data.js';
import type { ClaimRow, ClaimShown, RunState } from './run-state.js';

// RF-1004, RF-1014, DEC-136: what the events of a claim change in the claims list. A claim is `Proposed`
// when its card appears, `CitationsChecked` when it passed the citation check (it then waits for the
// judgement step, RF-301), `CitationInvalid` when the check failed, and `Supported`, `Rejected` or
// `Unverified` when a verdict arrives. Nothing is ever removed from the list.

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

// RF-1004, RF-1014, DEC-136
export function onCitationChecked(state: RunState, event: RunEvent): RunState {
  const parsed = citationCheckedData.safeParse(event.data);
  if (!parsed.success) return state;
  const { claimId, ok, reason, text, citations } = parsed.data;
  return withClaim(state, claimId, (claim) => ({
    ...claim,
    text: text ?? claim.text,
    citations: citations ?? claim.citations,
    status: ok ? 'CitationsChecked' : 'CitationInvalid',
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

// RF-250, RF-1004: a card merge renumbered claims; each claim row follows its move, all at once, so
// moves that exchange ids cannot overwrite each other.
export function onCardsMerged(state: RunState, event: RunEvent): RunState {
  const parsed = cardsMergedData.safeParse(event.data);
  if (!parsed.success) return state;
  const moves = new Map(parsed.data.claims.map((move) => [move.from, move.to]));
  const claims = state.claims.map((claim) => {
    const to = moves.get(claim.claimId);
    return to === undefined ? claim : { ...claim, claimId: to, cardId: cardOf(to) };
  });
  return { ...state, claims };
}

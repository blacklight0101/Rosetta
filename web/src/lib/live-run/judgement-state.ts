import type { ClaimRow, RunState } from './run-state.js';

// RF-1014, DEC-136, RF-301: what the page says about the judgement step (verifier step 2). The step
// is built, so nothing says it comes in a later version. A claim that passed its citation check is
// "waiting for judgement" only while the step is queued or running: the run still works and the
// step has not ended (`verify.judgement.ended`). Afterwards the claim shows its verdict; one the
// run left unjudged (a stop) says it was not judged.

const WAITING_NOTE = "Claims that passed the citation check wait for the verifier's judgement.";
const NOT_JUDGED_NOTE =
  'Citations checked means the cited lines exist; those claims were not judged.';
export const JUDGEMENT_EXPLAINED =
  'Each claim that passes is then judged by a second model against its cited lines.';

const VERDICTS: ReadonlySet<string> = new Set(['Supported', 'Rejected', 'Unverified']);

const passedOnly = (claim: ClaimRow): boolean => claim.status === 'CitationsChecked';

/** The judgement step is queued or running: the run works and the step has not ended. */
// RF-1014
export function judgementPending(state: Pick<RunState, 'ended' | 'judgement'>): boolean {
  return state.ended === undefined && state.judgement !== 'ended';
}

/** The note above the claims, or none when no claim waits or was left unjudged. */
// RF-1014
export function judgementNote(claims: readonly ClaimRow[], pending: boolean): string | undefined {
  if (!claims.some(passedOnly)) return undefined;
  return pending ? WAITING_NOTE : NOT_JUDGED_NOTE;
}

/** Whether a claim that passed its check still waits for the step (RF-1014). */
export function waitsForJudgement(state: RunState): boolean {
  return judgementPending(state) && state.claims.some(passedOnly);
}

/** `5 of 7 citations checked, 3 judged, 2 waiting for judgement`, or undefined with no claim. */
// RF-1014, RF-1002
export function verifyDetail(state: RunState): string | undefined {
  const { claims } = state;
  if (claims.length === 0) return undefined;
  const checked = claims.filter((claim) => claim.status !== 'Proposed').length;
  const judged = claims.filter((claim) => VERDICTS.has(claim.status)).length;
  const passed = claims.filter(passedOnly).length;
  const parts = [`${String(checked)} of ${String(claims.length)} citations checked`];
  if (judged > 0) parts.push(`${String(judged)} judged`);
  if (passed > 0) {
    const left = judgementPending(state) ? 'waiting for judgement' : 'not judged';
    parts.push(`${String(passed)} ${left}`);
  }
  return parts.join(', ');
}

import type { RunEvent } from '../../api/run-events.js';
import { claimCallData } from './event-data.js';
import type { RunState } from './run-state.js';

// RF-1002 (P8-60), data-model.md section 3.9 "Calls in flight": the verifier calls in flight are a
// set of claim ids. `verify.claim.started` adds its claim, `verify.claim.callEnded` removes it (an id
// that is not there changes nothing), and the step events and `run.ended` empty it, so a count left
// by a lost write cannot stick. A verdict changes nothing: verdicts leave in claim order.

function withVerifier(state: RunState, verifier: readonly string[]): RunState {
  return { ...state, inFlight: { ...state.inFlight, verifier } };
}

// RF-1002
export function onClaimCallStarted(state: RunState, event: RunEvent): RunState {
  const parsed = claimCallData.safeParse(event.data);
  if (!parsed.success) return state;
  const { claimId } = parsed.data;
  const { verifier } = state.inFlight;
  return verifier.includes(claimId) ? state : withVerifier(state, [...verifier, claimId]);
}

// RF-1002
export function onClaimCallEnded(state: RunState, event: RunEvent): RunState {
  const parsed = claimCallData.safeParse(event.data);
  if (!parsed.success) return state;
  const { claimId } = parsed.data;
  const { verifier } = state.inFlight;
  return verifier.includes(claimId)
    ? withVerifier(
        state,
        verifier.filter((each) => each !== claimId),
      )
    : state;
}

/** RF-1002: no verifier call in flight, at `verify.judgement.started`, `.ended` and `run.ended`. */
export function withoutVerifierCalls(state: RunState): RunState {
  return state.inFlight.verifier.length === 0 ? state : withVerifier(state, []);
}

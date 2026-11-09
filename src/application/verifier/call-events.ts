import type { RunEventPublisher } from '../runs/run-event-publisher.js';

// RF-1002, RF-1015, P8-58: the start and the end of a claim's judgement calls in the run log. A
// claim whose judgement sends a call publishes `verify.claim.started` just before the first call is
// sent and `verify.claim.callEnded` (same claim id) when the judgement stops calling the model, on
// every way it can end: a verdict, a call that throws, a stop, a cap that refuses a call. So the
// calls in flight at any moment are the starts without an end, exactly, which `verify.claim.judged`
// cannot give: it leaves in claim order and a finished claim waits for the slower ones before it.

export interface CallEventHooks {
  /** Told when the claim's first call is about to be sent; the event is queued, not awaited, there. */
  readonly onCallStarted?: (claim: { readonly claimId: string }) => Promise<void>;
  /** Told when the claim's calls are over, whatever the way. */
  readonly onCallEnded?: (claim: { readonly claimId: string }) => Promise<void>;
}

/**
 * Runs `calls` (the claim's model calls) between its start and end events. The start is queued before
 * `calls` begins, so it holds no call back, and its write is observed at once: a rejection waits in
 * `failures` instead of being unhandled while the call is pending. A write that failed does not lose
 * a call already sent: the calls finish and the error is thrown once they have, so the run fails
 * cleanly. If the calls themselves throw, that error wins over a failed write. The caller has already
 * checked that no stop or cap halted the claim: nothing runs between that check and the first call.
 */
export async function withCallEvents<T>(
  parts: CallEventHooks,
  claim: { readonly claimId: string },
  calls: () => Promise<T>,
): Promise<T> {
  if (parts.onCallStarted === undefined) return calls();
  const failures: unknown[] = [];
  const noted = (write: Promise<void> | undefined): Promise<void> =>
    (write ?? Promise.resolve()).catch((error: unknown) => {
      failures.push(error);
    });
  const started = noted(parts.onCallStarted(claim));
  let result: { readonly value: T } | undefined;
  try {
    result = { value: await calls() };
  } finally {
    await started;
    await noted(parts.onCallEnded?.(claim));
  }
  if (failures.length > 0) throw failures[0];
  return result.value;
}

/** The two hooks of one claim, publishing on the claim's agent task. */
export function callHooksOf(
  events: Pick<RunEventPublisher, 'emit'>,
  claim: { readonly claimId: string },
  agentTaskId: string,
): Required<CallEventHooks> {
  const tell = (type: 'verify.claim.started' | 'verify.claim.callEnded') => async () => {
    await events.emit(type, { claimId: claim.claimId }, agentTaskId);
  };
  return {
    onCallStarted: tell('verify.claim.started'),
    onCallEnded: tell('verify.claim.callEnded'),
  };
}

import { setTimeout as wait } from 'node:timers/promises';
import type {
  LlmAttemptFailure,
  LlmAttemptObserver,
  LlmResponse,
  TokenUsage,
} from '../../application/ports/llm-provider.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { ProviderCallError } from './provider-call-error.js';
import { backoffDelayMs } from './retry-backoff.js';

// RF-406, ADR-003: the retry loop every adapter shares. An adapter makes one attempt and
// classifies its failure; this loop tells the attempt observer, waits with jittered exponential
// back-off (never shorter than a retry-after hint) and stops on a permanent failure, when the
// retries are used up or when the call is cancelled.

/** One failed attempt as an adapter classified it. */
export interface AttemptFailed {
  readonly failure: LlmAttemptFailure;
  readonly retryable: boolean;
  readonly retryAfterMs?: number | undefined;
  /** A message that names the fix, when the catalogue's plain one is not enough. */
  readonly message?: string;
  readonly cause?: unknown;
  /** Nothing was sent to the provider (DEC-155): the budget guard frees the reservation. */
  readonly notSent?: boolean;
  /** The usage the provider reported for a call whose answer was dropped (DEC-155). */
  readonly usage?: TokenUsage;
}

export type AttemptResult =
  | { readonly ok: true; readonly response: LlmResponse }
  | { readonly ok: false; readonly failed: AttemptFailed };

/** Waits `ms`, rejecting when `signal` aborts. */
export type Sleep = (ms: number, signal: AbortSignal) => Promise<void>;

interface RetryPolicy {
  /** `providers.<name>.maxRetries` (RF-406). */
  readonly maxRetries: number;
  readonly sleep?: Sleep | undefined;
  /** A random number in [0, 1) for the back-off jitter. */
  readonly random?: (() => number) | undefined;
}

export interface RetryingCall {
  readonly attempt: () => Promise<AttemptResult>;
  readonly signal: AbortSignal;
  readonly policy: RetryPolicy;
  readonly observer?: LlmAttemptObserver | undefined;
}

/** RST-1501 for a call its caller cancelled. */
function cancelled(signal: AbortSignal): RosettaError {
  return new RosettaError(ERROR_CODES.providerCallCancelled, undefined, { cause: signal.reason });
}

async function backOff(retry: number, failed: AttemptFailed, call: RetryingCall): Promise<void> {
  const random = call.policy.random ?? Math.random;
  const delay = backoffDelayMs({ retry, random: random(), retryAfterMs: failed.retryAfterMs });
  const sleep = call.policy.sleep ?? ((ms, s) => wait(ms, undefined, { signal: s }));
  try {
    await sleep(delay, call.signal);
  } catch (error) {
    throw new RosettaError(ERROR_CODES.providerCallCancelled, undefined, { cause: error });
  }
}

/** Runs attempts until one answers or the call fails for good (RF-406). */
export async function completeWithRetries(call: RetryingCall): Promise<LlmResponse> {
  const { observer, signal, policy } = call;
  for (let retry = 0; ; retry += 1) {
    if (signal.aborted) throw cancelled(signal);
    observer?.attemptStarted();
    const result = await call.attempt();
    if (result.ok) return result.response;
    const { failed } = result;
    if (!failed.retryable || retry >= policy.maxRetries) {
      throw new ProviderCallError(failed.failure, {
        cause: failed.cause,
        message: failed.message,
        notSent: failed.notSent,
        usage: failed.usage,
      });
    }
    await observer?.attemptRetried(failed.failure);
    await backOff(retry + 1, failed, call);
  }
}

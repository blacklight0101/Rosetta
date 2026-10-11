// RF-406, conventions section 5: exponential back-off with jitter, honouring retry-after.

const baseDelayMs = 1000;
const maxBackoffMs = 30_000;
const maxRetryAfterMs = 300_000;

export interface BackoffInput {
  /** 1 for the first retry. */
  readonly retry: number;
  /** A random number in [0, 1) for the jitter. */
  readonly random: number;
  readonly retryAfterMs?: number | undefined;
}

/** The wait before retry `retry`: half to all of the doubled delay, at least the hint. */
export function backoffDelayMs(input: BackoffInput): number {
  const doubled = Math.min(maxBackoffMs, baseDelayMs * 2 ** (input.retry - 1));
  const jittered = Math.round(doubled * (0.5 + input.random / 2));
  const hint = Math.min(maxRetryAfterMs, input.retryAfterMs ?? 0);
  return Math.max(jittered, hint);
}

/** A `retry-after` header in seconds, in milliseconds; an HTTP date is not used. */
export function retryAfterMs(header: string | null): number | undefined {
  const value = header?.trim() ?? '';
  return /^\d{1,6}$/.test(value) ? Number(value) * 1000 : undefined;
}

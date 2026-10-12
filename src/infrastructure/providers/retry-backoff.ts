// RF-406, conventions section 5: exponential back-off with jitter, honouring retry-after.

const baseDelayMs = 1000;
const maxBackoffMs = 30_000;
const maxRetryAfterMs = 300_000;

/** The longest one wait between two attempts can be: a retry-after hint beats the back-off. */
export const maxBackoffWaitMs = Math.max(maxBackoffMs, maxRetryAfterMs);

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

/**
 * A `retry-after` header, in milliseconds: delay seconds, or an HTTP date counted from `nowMs`
 * (a date in the past is 0). The result is capped at five minutes.
 */
export function retryAfterMs(
  header: string | null,
  nowMs: number = Date.now(),
): number | undefined {
  const value = header?.trim() ?? '';
  if (/^\d{1,6}$/.test(value)) return Math.min(maxRetryAfterMs, Number(value) * 1000);
  if (value.length === 0 || value.length > 40 || !/^[A-Za-z]{3},/.test(value)) return undefined;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.min(maxRetryAfterMs, Math.max(0, date - nowMs));
}

/** A `retry-after-ms` header (OpenAI), in milliseconds. */
function retryAfterMsHeader(header: string | null): number | undefined {
  const value = header?.trim() ?? '';
  return /^\d{1,7}$/.test(value) ? Number(value) : undefined;
}

/** The retry hint of a response: `retry-after-ms` first, then `retry-after` in seconds. */
export function retryHintMs(headers: Headers, nowMs: number = Date.now()): number | undefined {
  return (
    retryAfterMsHeader(headers.get('retry-after-ms')) ??
    retryAfterMs(headers.get('retry-after'), nowMs)
  );
}

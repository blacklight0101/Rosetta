import type { ProviderKind } from '../../application/ports/llm-provider.js';
import { maxBackoffWaitMs } from './retry-backoff.js';

// RF-422, DEC-112, P1-27 note: how long the budget guard's reservation of a call counts without a
// renewal: every attempt's timeout, every wait between attempts at its longest (a back-off or a
// retry-after hint) and a margin. A streamed answer can run longer, because its timeout counts only
// idle time (Q-60), so the guard renews the reservation while the call runs (P3-99); this lifetime
// bounds how long a reservation of a call that no longer runs (the server stopped) still counts. An Ollama attempt may make three requests (the model digest, the context probe and
// the chat), each with the timeout.

const margin = 60_000;
const ollamaRequestsPerAttempt = 3;

export interface CallBounds {
  readonly kind: ProviderKind;
  /** `providers.<name>.timeoutSeconds`. */
  readonly timeoutSeconds: number;
  /** `providers.<name>.maxRetries`. */
  readonly maxRetries: number;
}

/** The longest one call can run, in milliseconds, without the margin. */
function callTimeoutMs(bounds: CallBounds): number {
  const requests = bounds.kind === 'ollama' ? ollamaRequestsPerAttempt : 1;
  const attempts = bounds.maxRetries + 1;
  return bounds.timeoutSeconds * 1000 * requests * attempts + bounds.maxRetries * maxBackoffWaitMs;
}

/** The lifetime of a reservation: the longest call plus the margin. */
// RF-422
export function reservationLifetimeMs(bounds: CallBounds): number {
  return callTimeoutMs(bounds) + margin;
}

import type { LlmRequest, TokenUsage } from '../../application/ports/llm-provider.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import type { AttemptFailed } from './retrying-call.js';
import { estimateInputTokens, estimateTokens } from './usage-estimate.js';

// ADR-007, RF-421, Q-60: a call that timed out may have been generated, and billed, in full. It is
// metered with its input estimated and its output counted from the text received so far, which can
// be none; `outputUnknown` says the provider may have produced more.

/** The usage of an attempt that timed out after `received` characters of answer. */
function timedOutUsage(request: LlmRequest, received: string): TokenUsage {
  return {
    inputTokens: estimateInputTokens(request),
    outputTokens: estimateTokens(received),
    cachedInputTokens: 0,
    usageSource: 'estimated',
    outputUnknown: true,
  };
}

/** The failure of an attempt, with the estimated usage when the attempt timed out. */
export function meteredIfTimedOut(
  failed: AttemptFailed,
  call: { readonly request: LlmRequest; readonly received: string },
): AttemptFailed {
  if (failed.failure.code !== ERROR_CODES.providerTimeout) return failed;
  return { ...failed, usage: timedOutUsage(call.request, call.received) };
}

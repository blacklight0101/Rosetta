import type { LlmRequest } from '../../application/ports/llm-provider.js';
import { estimateInputTokens } from './usage-estimate.js';

// RF-406, RF-401, P3-113, EV-29: how long one attempt waits for the first sign of life. A model
// reads its prompt before it writes a token, and a local model takes minutes over a prompt of
// 138,000 tokens, so the wait grows with the prompt: the provider's `timeoutSeconds` plus a few
// milliseconds for every token above a free size. A short prompt keeps the setting as it is. The
// idle time between the tokens that follow is the setting alone.

/** A prompt up to this size gets the setting as it is. */
export const FREE_PROMPT_TOKENS = 8_000;
/** The extra wait for every prompt token above the free size: 4 seconds for 1,000 tokens. */
const EXTRA_MS_PER_TOKEN = 4;
/** The longest wait the growth gives: 30 minutes (a setting above it stays as it is). */
export const MAX_WAIT_MS = 30 * 60_000;

/** The wait for the first token of a prompt of this many tokens, given the setting in milliseconds. */
export function firstTokenWaitMs(baseMs: number, promptTokens: number): number {
  const extra = Math.max(0, promptTokens - FREE_PROMPT_TOKENS) * EXTRA_MS_PER_TOKEN;
  return Math.max(baseMs, Math.min(baseMs + extra, MAX_WAIT_MS));
}

/** The wait for the first token of this request, from the estimate of its prompt (RF-421). */
export function requestWaitMs(baseMs: number, request: LlmRequest): number {
  return firstTokenWaitMs(baseMs, estimateInputTokens(request));
}

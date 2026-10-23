// RF-421, RF-422: the token counts of one model call. `inputTokens` includes the cached input
// tokens, as the providers report them (docs/providers.md); `cachedInputTokens` is the part of
// the input the provider read from its cache and `cacheWriteInputTokens` the part it wrote to its
// cache (P2-16; absent when the provider reported none).

export interface TokenUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteInputTokens?: number;
}

/** The tokens a call counts against a token cap: input (cached included) plus output (RF-422). */
export function totalTokens(usage: TokenUsage): bigint {
  return BigInt(usage.inputTokens) + BigInt(usage.outputTokens);
}

// P5-16 stub, replaced by the implementation commit.
export const CACHED_TOKEN_SHARE_PERCENT = 0;

export function capWeightedTokens(usage: TokenUsage): bigint {
  return totalTokens(usage);
}

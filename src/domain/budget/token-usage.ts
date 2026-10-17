// RF-421, RF-422: the token counts of one model call. `inputTokens` includes the cached input
// tokens, as the providers report them (docs/providers.md); `cachedInputTokens` is the part of
// the input the provider read from its cache.

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

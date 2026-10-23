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

/** The raw tokens of a call: input (cached included) plus output. The run page shows this total (RF-1003). */
export function totalTokens(usage: TokenUsage): bigint {
  return BigInt(usage.inputTokens) + BigInt(usage.outputTokens);
}

/**
 * DEC-168, P5-16: the share of a cached input token that counts toward a token cap, in percent. A
 * tenth is roughly what Anthropic and OpenAI charge for a cache read, so the token cap follows the
 * cost cap, which is already priced per token type (RF-420).
 */
export const CACHED_TOKEN_SHARE_PERCENT = 10;

/**
 * RF-422, DEC-168: the tokens a call counts toward a token cap (run, role and the shares of RF-429):
 * the input that was not read from the cache, `CACHED_TOKEN_SHARE_PERCENT` of the cached input
 * (rounded down), and the output. Cache writes are input that was not read from the cache, so they
 * count in full. The SQL of the budget guard (`cost-ledger-rows.ts`) states the same sum.
 */
export function capWeightedTokens(usage: TokenUsage): bigint {
  const input = BigInt(usage.inputTokens);
  const cachedRaw = BigInt(usage.cachedInputTokens);
  const cached = cachedRaw < input ? cachedRaw : input;
  const share = BigInt(CACHED_TOKEN_SHARE_PERCENT);
  return input - cached + (cached * share) / 100n + BigInt(usage.outputTokens);
}

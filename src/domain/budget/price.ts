import { microUsd, type Money } from './money.js';
import type { TokenUsage } from './token-usage.js';

// RF-420, DEC-54, data-model.md section 3.18: the price of one model of one provider kind, per
// million input, output, cached input and cache-write input tokens, in integer micro-dollars of its
// currency. Costs are computed with bigint only and a part of a micro-dollar rounds up, so a cost
// is never under-counted and no floating-point number ever holds money.

export interface Price {
  /** The provider kind (`openai`, `ollama`, ...), as in the project settings. */
  readonly provider: string;
  readonly model: string;
  readonly inputPerMillionMicros: bigint;
  readonly outputPerMillionMicros: bigint;
  readonly cachedInputPerMillionMicros: bigint;
  /**
   * The price of the tokens a call writes to the provider's prompt cache (Anthropic bills them at
   * 1.25 times the input price). Absent when the table gives none: the price lookup treats such an
   * entry of a provider kind that bills cache writes as a missing price (RF-427); every other kind
   * writes no tokens to a cache of its own price, so its written tokens are priced as input.
   */
  readonly cacheWriteInputPerMillionMicros?: bigint;
  readonly currency: 'USD';
}

/** A call before it is made: its prompt and the most it may answer (ADR-007). */
export interface CallBound {
  readonly promptTokens: number;
  readonly maxOutputTokens: number;
}

const perMillion = 1_000_000n;

function ceilDivide(amount: bigint, divisor: bigint): bigint {
  return (amount + divisor - 1n) / divisor;
}

function smaller(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function larger(left: bigint, right: bigint): bigint {
  return left > right ? left : right;
}

/** The cache-write price; the input price for a kind that bills no cache write of its own. */
function cacheWritePrice(price: Price): bigint {
  return price.cacheWriteInputPerMillionMicros ?? price.inputPerMillionMicros;
}

/** The input split into its uncached, cache-read and cache-written parts, each counted once. */
function inputParts(usage: TokenUsage): { uncached: bigint; cached: bigint; written: bigint } {
  const input = BigInt(usage.inputTokens);
  const cached = smaller(BigInt(usage.cachedInputTokens), input);
  const written = smaller(BigInt(usage.cacheWriteInputTokens ?? 0), input - cached);
  return { uncached: input - cached - written, cached, written };
}

/** The cost of a call's usage: uncached, cached and cache-written input, and output (RF-420). */
// RF-420
export function costOf(price: Price, usage: TokenUsage): Money {
  const { uncached, cached, written } = inputParts(usage);
  const total =
    uncached * price.inputPerMillionMicros +
    cached * price.cachedInputPerMillionMicros +
    written * cacheWritePrice(price) +
    BigInt(usage.outputTokens) * price.outputPerMillionMicros;
  return microUsd(ceilDivide(total, perMillion));
}

/** The part of a call's cost that paid for the tokens written to the cache, rounded up (RF-426). */
// RF-426
export function cacheWriteCostOf(price: Price, usage: TokenUsage): Money {
  return microUsd(ceilDivide(inputParts(usage).written * cacheWritePrice(price), perMillion));
}

/**
 * The most a call can cost: every prompt token at the highest of the input, cached input and
 * cache-write prices (the whole prompt may be written to the cache) plus the maximum output
 * (RF-422, ADR-007).
 */
// RF-422
export function worstCaseCost(price: Price, bound: CallBound): Money {
  const inputPrice = larger(
    larger(price.inputPerMillionMicros, price.cachedInputPerMillionMicros),
    cacheWritePrice(price),
  );
  const total =
    BigInt(bound.promptTokens) * inputPrice +
    BigInt(bound.maxOutputTokens) * price.outputPerMillionMicros;
  return microUsd(ceilDivide(total, perMillion));
}

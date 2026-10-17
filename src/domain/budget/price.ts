import { microUsd, zeroUsd, type Money } from './money.js';
import type { TokenUsage } from './token-usage.js';

// RF-420, DEC-54, data-model.md section 3.18: the price of one model of one provider kind, per
// million input, output and cached input tokens, in integer micro-dollars of its currency. Costs
// are computed with bigint only and a part of a micro-dollar rounds up, so a cost is never
// under-counted and no floating-point number ever holds money.

export interface Price {
  /** The provider kind (`openai`, `ollama`, ...), as in the project settings. */
  readonly provider: string;
  readonly model: string;
  readonly inputPerMillionMicros: bigint;
  readonly outputPerMillionMicros: bigint;
  readonly cachedInputPerMillionMicros: bigint;
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

/** The cost of a call's usage: uncached input, cached input and output (RF-420). */
// RF-420
export function costOf(price: Price, usage: TokenUsage): Money {
  const input = BigInt(usage.inputTokens);
  const cached = smaller(BigInt(usage.cachedInputTokens), input);
  const total =
    (input - cached) * price.inputPerMillionMicros +
    cached * price.cachedInputPerMillionMicros +
    BigInt(usage.outputTokens) * price.outputPerMillionMicros;
  return microUsd(ceilDivide(total, perMillion));
}

/**
 * The most a call can cost: every prompt token at the higher of the input and cached input prices
 * (no cache is assumed) plus the maximum output (RF-422, ADR-007).
 */
// RF-422
export function worstCaseCost(price: Price, bound: CallBound): Money {
  const { inputPerMillionMicros: input, cachedInputPerMillionMicros: cached } = price;
  const inputPrice = input > cached ? input : cached;
  const total =
    BigInt(bound.promptTokens) * inputPrice +
    BigInt(bound.maxOutputTokens) * price.outputPerMillionMicros;
  return microUsd(ceilDivide(total, perMillion));
}

// RF-426: stub until P2-16 is built.
export function cacheWriteCostOf(price: Price, usage: TokenUsage): Money {
  return usage.inputTokens < 0 ? microUsd(price.inputPerMillionMicros) : zeroUsd();
}

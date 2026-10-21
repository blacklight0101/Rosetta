import { describe, expect, it } from 'vitest';
import {
  cacheWriteCostOf,
  costOf,
  priceAt,
  worstCaseCost,
  type LongPromptTier,
  type Price,
} from '../../../../src/domain/budget/price.js';

// RF-420, Q-56: a model priced by prompt length (Claude Haiku 5.5: 0.10 / 0.50 USD per million input
// and output tokens up to 100,000 prompt tokens, 0.50 / 2.50 over) is priced per call at the tier its
// input tokens reach. The prompt counts every input token, cache reads and writes included.

const tier: LongPromptTier = {
  overInputTokens: 100_000,
  inputPerMillionMicros: 500_000n,
  outputPerMillionMicros: 2_500_000n,
  cachedInputPerMillionMicros: 50_000n,
  cacheWriteInputPerMillionMicros: 625_000n,
};

const haiku: Price = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  inputPerMillionMicros: 100_000n,
  outputPerMillionMicros: 500_000n,
  cachedInputPerMillionMicros: 10_000n,
  cacheWriteInputPerMillionMicros: 125_000n,
  longPrompt: tier,
  currency: 'USD',
};

function flatPrice(): Price {
  return {
    provider: 'openai',
    model: 'flat',
    inputPerMillionMicros: 1n,
    outputPerMillionMicros: 1n,
    cachedInputPerMillionMicros: 1n,
    currency: 'USD',
  };
}

function call(inputTokens: number, extra: { cached?: number; written?: number } = {}) {
  return {
    inputTokens,
    cachedInputTokens: extra.cached ?? 0,
    cacheWriteInputTokens: extra.written ?? 0,
    outputTokens: 1_000_000,
  };
}

describe('a price by prompt length', () => {
  it('RF-420 prices a call of 30,000 input tokens at the lower tier', () => {
    // 30,000 x 0.10 / 1M = 3,000 micros; 1M output x 0.50 = 500,000 micros
    expect(costOf(haiku, call(30_000)).micros).toBe(503_000n);
  });

  it('RF-420 prices a call of exactly 100,000 input tokens at the lower tier', () => {
    expect(costOf(haiku, call(100_000)).micros).toBe(510_000n);
  });

  it('RF-420 prices a call of 120,000 input tokens at the higher tier', () => {
    // 120,000 x 0.50 / 1M = 60,000 micros; 1M output x 2.50 = 2,500,000 micros
    expect(costOf(haiku, call(120_000)).micros).toBe(2_560_000n);
  });

  it('RF-420 prices a call one token over the threshold at the higher tier', () => {
    expect(costOf(haiku, call(100_001)).micros).toBe(2_550_001n);
  });

  it('RF-420 counts cache reads and writes in the prompt that crosses the threshold together', () => {
    // 60,000 read x 0.05 + 50,000 written x 0.625 + 10,000 plain x 0.50 = 3,000 + 31,250 + 5,000
    const crossing = call(120_000, { cached: 60_000, written: 50_000 });

    expect(costOf(haiku, crossing).micros).toBe(2_500_000n + 39_250n);
  });
});

describe('the cache-write and worst-case cost of a price by prompt length', () => {
  it('RF-426 prices the cache-written part of a long call at the higher cache-write price', () => {
    expect(cacheWriteCostOf(haiku, call(120_000, { written: 80_000 })).micros).toBe(50_000n);
    expect(cacheWriteCostOf(haiku, call(90_000, { written: 80_000 })).micros).toBe(10_000n);
  });

  it('RF-422 prices the worst case of a call at the tier its prompt reaches', () => {
    const lower = worstCaseCost(haiku, { promptTokens: 100_000, maxOutputTokens: 1_000_000 });
    const higher = worstCaseCost(haiku, { promptTokens: 100_001, maxOutputTokens: 1_000_000 });

    // the highest input price of the tier: cache write 0.125 and 0.625
    expect(lower.micros).toBe(12_500n + 500_000n);
    expect(higher.micros).toBe(62_501n + 2_500_000n);
  });

  it('RF-420 chooses a price by the prompt, and a price without a tier is the price itself', () => {
    const flat = flatPrice();

    expect(priceAt(haiku, 100_000)).toMatchObject({ inputPerMillionMicros: 100_000n });
    expect(priceAt(haiku, 100_001)).toMatchObject({ inputPerMillionMicros: 500_000n });
    // the chosen price has no tier left, so applying it to a sum of many calls cannot re-tier it
    expect(priceAt(haiku, 100_001)).not.toHaveProperty('longPrompt');
    expect(costOf(priceAt(haiku, 50_000), call(5_000_000)).micros).toBe(500_000n + 500_000n);
    expect(priceAt(flat, 5_000_000)).toBe(flat);
  });

  it('RF-427 leaves an entry without a cache-write price without one below its tier', () => {
    const noWrite: Price = { ...flatPrice(), longPrompt: tier };

    expect(priceAt(noWrite, 10)).not.toHaveProperty('cacheWriteInputPerMillionMicros');
    expect(priceAt(noWrite, 1_000_000)).toMatchObject({
      cacheWriteInputPerMillionMicros: 625_000n,
    });
  });
});

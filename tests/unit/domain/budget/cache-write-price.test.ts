import { describe, expect, it } from 'vitest';
import {
  cacheWriteCostOf,
  costOf,
  worstCaseCost,
  type Price,
} from '../../../../src/domain/budget/price.js';
import { lookupPrice, type PriceTable } from '../../../../src/domain/budget/price-table.js';

// RF-420, RF-422, RF-427, P2-16: Anthropic bills the tokens a call writes to its prompt cache at a
// price of their own (1.25 times the input price). The price table carries a cache-write price per
// model; written tokens are priced at it, the worst case covers it, and a model of a provider kind
// that bills cache writes without that price is handled as a model missing from the table.

const claude: Price = {
  provider: 'anthropic',
  model: 'claude-test',
  inputPerMillionMicros: 3_000_000n,
  cachedInputPerMillionMicros: 300_000n,
  cacheWriteInputPerMillionMicros: 3_750_000n,
  outputPerMillionMicros: 15_000_000n,
  currency: 'USD',
};

const nano: Price = {
  provider: 'openai',
  model: 'gpt-5-nano',
  inputPerMillionMicros: 50_000n,
  cachedInputPerMillionMicros: 5_000n,
  outputPerMillionMicros: 400_000n,
  currency: 'USD',
};

const claudeWithoutCacheWrite: Price = {
  provider: 'anthropic',
  model: 'claude-test',
  inputPerMillionMicros: 3_000_000n,
  cachedInputPerMillionMicros: 300_000n,
  outputPerMillionMicros: 15_000_000n,
  currency: 'USD',
};

const table = (prices: readonly Price[]): PriceTable => ({
  version: '2026-10-11',
  currency: 'USD',
  prices,
});

describe('cache-write pricing', () => {
  it('RF-420 prices the tokens written to the cache at the cache-write price', () => {
    const cost = costOf(claude, {
      inputTokens: 1_200_000,
      cachedInputTokens: 200_000,
      cacheWriteInputTokens: 500_000,
      outputTokens: 100_000,
    });

    // 0.5M uncached x 3 + 0.2M read x 0.30 + 0.5M written x 3.75 + 0.1M output x 15
    expect(cost).toEqual({ micros: 4_935_000n, currency: 'USD' });
  });

  it('RF-420 counts written tokens beyond the uncached input only once', () => {
    const usage = {
      inputTokens: 1_000_000,
      cachedInputTokens: 400_000,
      cacheWriteInputTokens: 5_000_000,
      outputTokens: 0,
    };

    // 0.4M read x 0.30 + 0.6M written x 3.75
    expect(costOf(claude, usage).micros).toBe(2_370_000n);
    expect(cacheWriteCostOf(claude, usage).micros).toBe(2_250_000n);
  });

  it('RF-426 gives the cost of the written tokens alone, rounded up', () => {
    const usage = { inputTokens: 1200, cachedInputTokens: 0, outputTokens: 80 };

    expect(cacheWriteCostOf(claude, { ...usage, cacheWriteInputTokens: 1024 }).micros).toBe(3840n);
    expect(cacheWriteCostOf(claude, { ...usage, cacheWriteInputTokens: 1 }).micros).toBe(4n);
    expect(cacheWriteCostOf(claude, usage).micros).toBe(0n);
  });
});

describe('cache-write worst case and providers without cache writes', () => {
  it('RF-422 prices the worst case at the cache-write price when it is the highest input price', () => {
    expect(worstCaseCost(claude, { promptTokens: 1_000_000, maxOutputTokens: 0 }).micros).toBe(
      3_750_000n,
    );
    expect(
      worstCaseCost(claude, { promptTokens: 1_000_000, maxOutputTokens: 1_000_000 }).micros,
    ).toBe(18_750_000n);
  });

  it('RF-420 a provider kind without cache writes keeps pricing any written token as input', () => {
    const usage = {
      inputTokens: 1_000_000,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 1_000_000,
      outputTokens: 0,
    };

    expect(costOf(nano, usage).micros).toBe(50_000n);
    expect(cacheWriteCostOf(nano, usage).micros).toBe(50_000n);
    expect(worstCaseCost(nano, { promptTokens: 1_000_000, maxOutputTokens: 0 }).micros).toBe(
      50_000n,
    );
  });
});

const server = { provider: 'anthropic', model: 'claude-test', keySource: 'server' } as const;
const own = { ...server, keySource: 'user' } as const;

describe('a model without a cache-write price', () => {
  it('RF-427 an Anthropic model listed without a cache-write price is unpriced', () => {
    expect(lookupPrice(table([claudeWithoutCacheWrite]), [], server)).toEqual({
      kind: 'unpriced',
    });
  });

  it('RF-427 an Anthropic override without a cache-write price does not price the model', () => {
    expect(lookupPrice(table([]), [claudeWithoutCacheWrite], own)).toEqual({ kind: 'unpriced' });
  });

  it('RF-1106 an Anthropic override without a cache-write price leaves the shipped price', () => {
    expect(lookupPrice(table([claude]), [claudeWithoutCacheWrite], own)).toEqual({
      kind: 'priced',
      price: claude,
      version: '2026-10-11',
    });
  });
});

describe('models that need no cache-write price', () => {
  it('RF-420 an Anthropic model with its cache-write price is priced', () => {
    expect(lookupPrice(table([claude]), [], server)).toEqual({
      kind: 'priced',
      price: claude,
      version: '2026-10-11',
    });
  });

  it('RF-420 an OpenAI model needs no cache-write price, as OpenAI bills no cache write', () => {
    expect(
      lookupPrice(table([nano]), [], {
        provider: 'openai',
        model: 'gpt-5-nano',
        keySource: 'user',
      }),
    ).toEqual({ kind: 'priced', price: nano, version: '2026-10-11' });
  });

  it('RF-420 a local model missing from the table writes to its cache for free', () => {
    const lookup = lookupPrice(table([]), [], {
      provider: 'ollama',
      model: 'gemma4:e4b',
      keySource: 'none',
    });
    const usage = {
      inputTokens: 9,
      cachedInputTokens: 0,
      cacheWriteInputTokens: 9,
      outputTokens: 9,
    };

    expect(lookup.kind === 'priced' ? costOf(lookup.price, usage).micros : -1n).toBe(0n);
    expect(lookup.kind === 'priced' ? lookup.price.cacheWriteInputPerMillionMicros : -1n).toBe(0n);
  });
});

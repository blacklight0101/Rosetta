import { describe, expect, it } from 'vitest';
import { costOf, worstCaseCost, type Price } from '../../../../src/domain/budget/price.js';
import { lookupPrice, type PriceTable } from '../../../../src/domain/budget/price-table.js';
import { totalTokens } from '../../../../src/domain/budget/token-usage.js';

// RF-420, RF-427, DEC-54, DEC-107: prices per million tokens in integer micro-USD; costs never
// pass through a floating-point number.

const nano: Price = {
  provider: 'openai',
  model: 'gpt-5-nano',
  inputPerMillionMicros: 50_000n,
  cachedInputPerMillionMicros: 5_000n,
  outputPerMillionMicros: 400_000n,
  currency: 'USD',
};

const table: PriceTable = { version: '2026-10-11', currency: 'USD', prices: [nano] };

describe('pricing', () => {
  it('RF-420 prices uncached input, cached input and output per million tokens', () => {
    const cost = costOf(nano, {
      inputTokens: 1_200_000,
      cachedInputTokens: 200_000,
      outputTokens: 500_000,
    });

    // 1.0M uncached x 0.05 + 0.2M cached x 0.005 + 0.5M output x 0.40 = 0.05 + 0.001 + 0.20
    expect(cost).toEqual({ micros: 251_000n, currency: 'USD' });
  });

  it('RF-420 rounds a part of a micro-dollar up, so a cost is never under-counted', () => {
    expect(costOf(nano, { inputTokens: 1, cachedInputTokens: 0, outputTokens: 0 }).micros).toBe(1n);
    expect(costOf(nano, { inputTokens: 20, cachedInputTokens: 0, outputTokens: 0 }).micros).toBe(
      1n,
    );
    expect(costOf(nano, { inputTokens: 21, cachedInputTokens: 0, outputTokens: 0 }).micros).toBe(
      2n,
    );
  });

  it('RF-420 counts cached tokens beyond the input as input only once', () => {
    const cost = costOf(nano, { inputTokens: 100, cachedInputTokens: 500, outputTokens: 0 });

    expect(cost.micros).toBe(1n);
  });

  it('RF-420 handles token counts far beyond the safe range of a float product', () => {
    const big: Price = { ...nano, inputPerMillionMicros: 9_007_199_254_740_993n };

    const cost = costOf(big, { inputTokens: 3_000_000, cachedInputTokens: 0, outputTokens: 0 });

    expect(cost.micros).toBe(27_021_597_764_222_979n);
  });

  it('RF-422 prices the worst case as the whole prompt uncached plus the maximum output', () => {
    expect(
      worstCaseCost(nano, { promptTokens: 1_000_000, maxOutputTokens: 1_000_000 }).micros,
    ).toBe(450_000n);
  });

  it('RF-422 uses the cached price for the worst case when an override sets it higher', () => {
    const odd: Price = { ...nano, cachedInputPerMillionMicros: 80_000n };

    expect(worstCaseCost(odd, { promptTokens: 1_000_000, maxOutputTokens: 0 }).micros).toBe(
      80_000n,
    );
  });

  it('RF-422 counts input and output tokens for the token cap, cached input inside input', () => {
    expect(totalTokens({ inputTokens: 1200, cachedInputTokens: 1024, outputTokens: 80 })).toBe(
      1280n,
    );
  });
});

describe('price lookup', () => {
  const override: Price = { ...nano, inputPerMillionMicros: 1n, outputPerMillionMicros: 2n };

  it('RF-420 finds the shipped price of a model', () => {
    expect(
      lookupPrice(table, [], { provider: 'openai', model: 'gpt-5-nano', keySource: 'server' }),
    ).toEqual({
      kind: 'priced',
      price: nano,
      version: '2026-10-11',
    });
  });

  it('RF-1106 a call with a server key ignores the project overrides (DEC-107)', () => {
    const lookup = lookupPrice(table, [override], {
      provider: 'openai',
      model: 'gpt-5-nano',
      keySource: 'server',
    });

    expect(lookup).toEqual({ kind: 'priced', price: nano, version: '2026-10-11' });
  });

  it('RF-1106 a call with the user own key takes the project override first (DEC-107)', () => {
    const lookup = lookupPrice(table, [override], {
      provider: 'openai',
      model: 'gpt-5-nano',
      keySource: 'user',
    });

    expect(lookup).toEqual({ kind: 'priced', price: override, version: '2026-10-11+project' });
  });

  it('RF-420 prices a local model missing from the table at zero', () => {
    const lookup = lookupPrice(table, [], {
      provider: 'ollama',
      model: 'gemma4:e4b',
      keySource: 'none',
    });

    expect(lookup.kind).toBe('priced');
    expect(
      lookup.kind === 'priced'
        ? costOf(lookup.price, { inputTokens: 9, cachedInputTokens: 0, outputTokens: 9 }).micros
        : -1n,
    ).toBe(0n);
  });

  it('RF-427 answers unpriced for a cloud model missing from the table', () => {
    expect(
      lookupPrice(table, [], { provider: 'anthropic', model: 'claude-x', keySource: 'user' }),
    ).toEqual({
      kind: 'unpriced',
    });
  });

  it('RF-427 an override of another provider kind does not price the model', () => {
    const lookup = lookupPrice(table, [{ ...override, provider: 'openai-compatible' }], {
      provider: 'anthropic',
      model: 'gpt-5-nano',
      keySource: 'user',
    });

    expect(lookup).toEqual({ kind: 'unpriced' });
  });
});

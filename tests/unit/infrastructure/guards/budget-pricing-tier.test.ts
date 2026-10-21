import { describe, expect, it } from 'vitest';
import type { Price } from '../../../../src/domain/budget/price.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import {
  priceCall,
  pricerFor,
  worstCaseOf,
  type BudgetPricing,
} from '../../../../src/infrastructure/guards/budget-pricing.js';

// RF-420, RF-422, DEC-107, Q-56: the budget guard prices a call by its input tokens: the cap check
// (worst case) by the prompt it measured, the ledger and the call log by the usage the provider
// reported. A project override replaces the shipped price, tiers and all, and only on the user's
// own key.

const shipped: Price = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  inputPerMillionMicros: 100_000n,
  outputPerMillionMicros: 500_000n,
  cachedInputPerMillionMicros: 10_000n,
  cacheWriteInputPerMillionMicros: 125_000n,
  longPrompt: {
    overInputTokens: 100_000,
    inputPerMillionMicros: 500_000n,
    outputPerMillionMicros: 2_500_000n,
    cachedInputPerMillionMicros: 50_000n,
    cacheWriteInputPerMillionMicros: 625_000n,
  },
  currency: 'USD',
};
const own: Price = {
  provider: 'anthropic',
  model: 'claude-haiku-5-5',
  inputPerMillionMicros: 7_000_000n,
  outputPerMillionMicros: 7_000_000n,
  cachedInputPerMillionMicros: 7_000_000n,
  cacheWriteInputPerMillionMicros: 7_000_000n,
  currency: 'USD',
};
const table: PriceTable = { version: '2026-10-21', currency: 'USD', prices: [shipped] };
const pricing: BudgetPricing = { table, overrides: [own], allowUnpriced: false };
const usage = (inputTokens: number) => ({
  inputTokens,
  cachedInputTokens: 0,
  outputTokens: 0,
  usageSource: 'reported' as const,
});

describe('the guard pricing a call by its prompt', () => {
  it('RF-420 prices the ledger cost of a server-key call at the tier of its input tokens', () => {
    const pricer = pricerFor(pricing, { kind: 'anthropic', keySource: 'server' });
    const cost = (inputTokens: number): bigint =>
      pricer({ provider: 'anthropic', model: 'claude-haiku-5-5', usage: usage(inputTokens) })
        .micros;

    expect(cost(30_000)).toBe(3_000n);
    expect(cost(100_000)).toBe(10_000n);
    expect(cost(120_000)).toBe(60_000n);
  });

  it('RF-422 checks the cap of a server-key call with the tier its prompt reaches', () => {
    const { price } = priceCall(
      pricing,
      { kind: 'anthropic', keySource: 'server' },
      'claude-haiku-5-5',
    );

    expect(worstCaseOf(price, { promptTokens: 100_000, maxOutputTokens: 0 }).micros).toBe(12_500n);
    expect(worstCaseOf(price, { promptTokens: 100_001, maxOutputTokens: 0 }).micros).toBe(62_501n);
  });

  it('DEC-107 ignores the project override on a server key, tiers included', () => {
    const { price } = priceCall(
      pricing,
      { kind: 'anthropic', keySource: 'server' },
      'claude-haiku-5-5',
    );

    expect(price).toBe(shipped);
  });

  it('DEC-107 applies the project override, a flat price, on the own key', () => {
    const call = priceCall(pricing, { kind: 'anthropic', keySource: 'user' }, 'claude-haiku-5-5');
    const pricer = pricerFor(pricing, { kind: 'anthropic', keySource: 'user' });

    expect(call.price).toBe(own);
    expect(call.version).toBe('2026-10-21+project');
    expect(
      pricer({ provider: 'anthropic', model: 'claude-haiku-5-5', usage: usage(1_000_000) }).micros,
    ).toBe(7_000_000n);
    expect(
      pricer({ provider: 'anthropic', model: 'claude-haiku-5-5', usage: usage(120_000) }).micros,
    ).toBe(840_000n);
  });
});

import { describe, expect, it } from 'vitest';
import type { Price } from '../../../../src/domain/budget/price.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  priceCall,
  type BudgetPricing,
} from '../../../../src/infrastructure/guards/budget-pricing.js';

// RF-427, P2-24: an own-key Anthropic override without a cache-write price is no price, and the
// error says so: it names the override and the missing cache-write price instead of claiming the
// price table has no price for the model.

const table: PriceTable = { version: '2026-10-11', currency: 'USD', prices: [] };
const override: Price = {
  provider: 'anthropic',
  model: 'claude-test',
  inputPerMillionMicros: 3_000_000n,
  outputPerMillionMicros: 15_000_000n,
  cachedInputPerMillionMicros: 300_000n,
  currency: 'USD',
};
const pricing: BudgetPricing = { table, overrides: [override], allowUnpriced: false };

function refusal(keySource: 'user' | 'server'): RosettaError {
  try {
    priceCall(pricing, { kind: 'anthropic', keySource }, 'claude-test');
  } catch (error) {
    if (error instanceof RosettaError) return error;
    throw error;
  }
  throw new Error('The call was priced');
}

describe('an Anthropic override without a cache-write price', () => {
  it('RF-427 the error on the own key names the override and the missing cache-write price', () => {
    const error = refusal('user');

    expect(error.code).toBe(ERROR_CODES.modelUnpriced);
    expect(error.message).toContain('price override');
    expect(error.message).toContain('claude-test');
    expect(error.message).toContain('cache-write');
    expect(error.message).not.toContain('no price in the price table');
  });

  it('RF-427 a server key ignores overrides, so its error stays the price table one', () => {
    expect(refusal('server').message).toContain('no price in the price table');
  });

  it('RF-427 a model with no override keeps the price table error on the own key', () => {
    expect(() => {
      priceCall(pricing, { kind: 'anthropic', keySource: 'user' }, 'other-model');
    }).toThrow(/no price in the price table/);
  });
});

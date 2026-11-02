import { describe, expect, it } from 'vitest';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import {
  priceCall,
  type BudgetPricing,
} from '../../../../src/infrastructure/guards/budget-pricing.js';

// RF-433, RF-420, RF-427, P8-04: an Ollama server that is not this machine is not free. The price
// table gives the zero price to a local kind only; a remote Ollama model with no price in the table
// is refused (RST-1601) with a plain message, like a cloud model without a price.

const table: PriceTable = { version: '2026-11-02', currency: 'USD', prices: [] };
const local: BudgetPricing = {
  table,
  overrides: [],
  allowUnpriced: false,
  ollamaHost: 'localhost',
};
const remote: BudgetPricing = { ...local, ollamaHost: 'ollama.example.org' };
const query = { kind: 'ollama', keySource: 'none' } as const;

function refusalOf(call: () => unknown): RosettaError | undefined {
  try {
    call();
  } catch (error) {
    return error instanceof RosettaError ? error : undefined;
  }
  return undefined;
}

describe('RF-433 pricing a call to Ollama', () => {
  it('RF-433 prices a call to Ollama on this machine at zero', () => {
    const { price } = priceCall(local, query, 'gemma4:e4b');

    expect(price?.inputPerMillionMicros).toBe(0n);
    expect(price?.outputPerMillionMicros).toBe(0n);
  });

  it('RF-433 prices a call to Ollama when no address is configured as a local one', () => {
    const { price } = priceCall({ ...local, ollamaHost: undefined }, query, 'gemma4:e4b');

    expect(price?.inputPerMillionMicros).toBe(0n);
  });

  it('RF-433 refuses a call to a remote Ollama host that has no price, with a plain message', () => {
    const refusal = refusalOf(() => priceCall(remote, query, 'gemma4:e4b'));

    expect(refusal).toBeInstanceOf(RosettaError);
    expect(refusal?.code).toBe(ERROR_CODES.modelUnpriced);
    expect(refusal?.message).toContain('not on this machine');
  });

  it('RF-433 prices a remote Ollama model that the table lists, like a cloud model', () => {
    const priced: BudgetPricing = {
      ...remote,
      table: {
        ...table,
        prices: [
          {
            provider: 'ollama',
            model: 'gemma4:e4b',
            inputPerMillionMicros: 200_000n,
            outputPerMillionMicros: 400_000n,
            cachedInputPerMillionMicros: 20_000n,
            currency: 'USD',
          },
        ],
      },
    };

    expect(priceCall(priced, query, 'gemma4:e4b').price?.inputPerMillionMicros).toBe(200_000n);
  });

  it('RF-433 never changes the price of the fake provider by the Ollama host', () => {
    const { price } = priceCall(remote, { kind: 'fake', keySource: 'none' }, 'fake-model');

    expect(price?.inputPerMillionMicros).toBe(0n);
  });
});

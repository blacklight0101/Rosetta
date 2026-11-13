import { describe, expect, it } from 'vitest';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import {
  holdLifetimeProblem,
  modelIsFree,
} from '../../../../src/presentation/lab/lab-ledger-path.js';

// RF-1402: a hold must outlive the longest call, except where a call costs nothing.

const slow = { timeoutSeconds: 600, maxRetries: 5 } as const;
const price = (model: string, micros: bigint) => ({
  ...{ provider: 'ollama', model, currency: 'USD' as const },
  ...{ inputPerMillionMicros: micros, outputPerMillionMicros: micros },
  cachedInputPerMillionMicros: 0n,
});
const table: PriceTable = {
  version: 'v',
  currency: 'USD',
  prices: [price('free-model', 0n), price('paid-model', 5n)],
};

describe('the hold lifetime check', () => {
  it('RF-1402 refuses a provider whose call could outlive the hold', () => {
    expect(holdLifetimeProblem('openai', { kind: 'openai', ...slow }, false)).toContain(
      '30 minutes',
    );
  });

  it('RF-1402 lets a local Ollama provider start when its model is free: a hold that expires loses nothing', () => {
    expect(holdLifetimeProblem('ollama', { kind: 'ollama', ...slow }, true)).toBeUndefined();
  });

  it('RF-1402 still checks an Ollama model that has a price', () => {
    expect(holdLifetimeProblem('ollama', { kind: 'ollama', ...slow }, false)).toContain(
      '30 minutes',
    );
  });

  it('RF-1402 calls a model free only when the price table prices it at zero', () => {
    expect(modelIsFree(table, 'ollama', 'free-model')).toBe(true);
    expect(modelIsFree(table, 'ollama', 'paid-model')).toBe(false);
    expect(modelIsFree(table, 'ollama', 'unlisted')).toBe(false);
  });
});

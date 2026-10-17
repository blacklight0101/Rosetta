import { describe, expect, it } from 'vitest';
import type { Price } from '../../../../src/domain/budget/price.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Recording } from '../../../../src/infrastructure/providers/fake/recording.js';
import { estimateInputTokens } from '../../../../src/infrastructure/providers/usage-estimate.js';
import { budgetHarness, budgetRequest, budgetRun } from '../../../support/budget-harness.js';
import { fakeResponse } from '../../../support/fake-recordings.js';

// RF-420, RF-422, RF-427, RF-428, P2-16: the budget guard prices the tokens a call writes to the
// provider's prompt cache at the model's cache-write price, reserves a worst case that covers that
// price, and keeps the written tokens and their cost in the ledger row. A model of a provider kind
// that bills cache writes without a cache-write price is handled as a model without a price.

const claude: Price = {
  provider: 'anthropic',
  model: 'contract-model',
  inputPerMillionMicros: 1_000_000n,
  cachedInputPerMillionMicros: 100_000n,
  cacheWriteInputPerMillionMicros: 1_250_000n,
  outputPerMillionMicros: 2_000_000n,
  currency: 'USD',
};

const claudeWithoutCacheWrite: Price = {
  provider: 'anthropic',
  model: 'contract-model',
  inputPerMillionMicros: 1_000_000n,
  cachedInputPerMillionMicros: 100_000n,
  outputPerMillionMicros: 2_000_000n,
  currency: 'USD',
};

const tableOf = (price: Price): PriceTable => ({
  version: '2026-10-11',
  currency: 'USD',
  prices: [price],
});

/** One answer that read 200 tokens from the cache and wrote 1,000 to it. */
const cacheWrite: Recording = {
  schemaVersion: 1,
  description: 'built in memory by a test: a call that wrote 1,000 tokens to the cache',
  calls: [
    {
      attempts: [
        {
          response: fakeResponse({
            text: 'The Catalog area lists products.',
            toolCalls: [],
            usage: {
              inputTokens: 1500,
              outputTokens: 100,
              cachedInputTokens: 200,
              cacheWriteInputTokens: 1000,
              usageSource: 'reported',
            },
            finishReason: 'stop',
          }),
        },
      ],
    },
  ],
};

/** 300 uncached x 1 + 200 read x 0.1 + 1,000 written x 1.25 + 100 output x 2. */
const settledMicros = 300n + 20n + 1250n + 200n;

describe('BudgetGuard cache writes', () => {
  it('RF-420 RF-428 settles written tokens at the cache-write price and keeps them in the row', async () => {
    const h = budgetHarness({ kind: 'anthropic', table: tableOf(claude), recording: cacheWrite });

    await h.guard.complete(budgetRequest());

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entry).toMatchObject({
      inputTokens: 1500,
      cachedInputTokens: 200,
      cacheWriteInputTokens: 1000,
      costMicros: settledMicros,
      cacheWriteCostMicros: 1250n,
      costKnown: true,
    });
  });

  it('RF-422 reserves the prompt at the cache-write price when it is the highest', async () => {
    const h = budgetHarness({
      kind: 'anthropic',
      table: tableOf(claude),
      recording: cacheWrite,
      caps: [{ kind: 'run-cost', limit: 1n }],
    });

    await h.guard.complete(budgetRequest()).catch(() => undefined);

    const promptTokens = BigInt(estimateInputTokens(budgetRequest()));
    // Prompt x 1.25 plus 512 output x 2, rounded up.
    const needed = (promptTokens * 1_250_000n + 512n * 2_000_000n + 999_999n) / 1_000_000n;
    expect(h.reported.caps).toEqual([{ kind: 'run-cost', limit: 1n, spent: 0n, needed }]);
  });
});

describe('BudgetGuard and a model without a cache-write price', () => {
  it('RF-427 refuses with RST-1601 an Anthropic model without a cache-write price on a server key', async () => {
    const h = budgetHarness({
      kind: 'anthropic',
      table: tableOf(claudeWithoutCacheWrite),
      recording: cacheWrite,
    });

    await expect(h.guard.complete(budgetRequest())).rejects.toMatchObject({
      code: ERROR_CODES.modelUnpriced,
    });
    expect(h.fake.requests).toEqual([]);
    expect(await h.ledger.runEntries(budgetRun.userId, budgetRun.id)).toEqual([]);
  });

  it('RF-427 runs it with an unknown cost on the user own key with allowUnpriced', async () => {
    const h = budgetHarness({
      kind: 'anthropic',
      keySource: 'user',
      allowUnpriced: true,
      table: tableOf(claudeWithoutCacheWrite),
      recording: cacheWrite,
    });

    await h.guard.complete(budgetRequest());

    const [entry] = await h.ledger.runEntries(budgetRun.userId, budgetRun.id);
    expect(entry).toMatchObject({
      cacheWriteInputTokens: 1000,
      costMicros: 0n,
      cacheWriteCostMicros: 0n,
      costKnown: false,
    });
  });
});

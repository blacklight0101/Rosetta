import { describe, expect, it } from 'vitest';
import type { RoleEstimate } from '../../../../src/application/estimate/estimate-types.js';
import type { Price } from '../../../../src/domain/budget/price.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import {
  catalogAreas,
  createEstimateHarness,
  projectWithScan,
} from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-425, RF-420, P2-24: Anthropic bills the tokens it writes to its prompt cache above the input
// price, so the high figure of the estimate prices the prompt at the highest of the input and the
// cache-write price. The likely and low figures keep the input price. The price table is a recorded
// one (Sonnet-class prices: 3, 0.30, 3.75 and 15 USD per million tokens).

function claude(overrides: Partial<Price> = {}): Price {
  return {
    provider: 'anthropic',
    model: 'claude-test',
    inputPerMillionMicros: 3_000_000n,
    outputPerMillionMicros: 15_000_000n,
    cachedInputPerMillionMicros: 300_000n,
    cacheWriteInputPerMillionMicros: 3_750_000n,
    currency: 'USD',
    ...overrides,
  };
}

const anthropicRoles = settingsFor({
  reader: { provider: 'anthropic', model: 'claude-test' },
  verifier: { provider: 'anthropic', model: 'claude-test' },
  summariser: { provider: 'anthropic', model: 'claude-test' },
});

async function readerOf(price: Price): Promise<RoleEstimate> {
  const table: PriceTable = { version: '2026-10-11', currency: 'USD', prices: [price] };
  const harness = createEstimateHarness(catalogAreas, [], table);
  const project = await projectWithScan(harness, userAmy.userId, anthropicRoles);
  const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });
  const reader = outcome.ok ? outcome.value.roles[0] : undefined;
  if (reader === undefined) throw new Error('The estimate has no reader');
  return reader;
}

const micros = (inputTokens: number, outputTokens: number, inputPrice: bigint, out: bigint) =>
  (BigInt(inputTokens) * inputPrice + BigInt(outputTokens) * out + 999_999n) / 1_000_000n;

describe('the estimate and Anthropic cache writes', () => {
  it('RF-425 the high figure prices the prompt at the cache-write price', async () => {
    const reader = await readerOf(claude());
    const { inputTokens, outputTokens, costMicros } = reader.points.high;

    expect(costMicros).toBe(micros(inputTokens, outputTokens, 3_750_000n, 15_000_000n));
  });

  it('RF-425 the likely and low figures keep the input price', async () => {
    const reader = await readerOf(claude());

    for (const point of [reader.points.low, reader.points.likely]) {
      expect(point.costMicros).toBe(
        micros(point.inputTokens, point.outputTokens, 3_000_000n, 15_000_000n),
      );
    }
  });

  it('RF-425 a cache-write price below the input price leaves the high figure at the input price', async () => {
    const reader = await readerOf(claude({ cacheWriteInputPerMillionMicros: 2_000_000n }));
    const { inputTokens, outputTokens, costMicros } = reader.points.high;

    expect(costMicros).toBe(micros(inputTokens, outputTokens, 3_000_000n, 15_000_000n));
  });
});

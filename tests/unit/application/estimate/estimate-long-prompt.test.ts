import { describe, expect, it } from 'vitest';
import { assumptionsOf } from '../../../../src/application/estimate/estimate-assumptions.js';
import type { RoleEstimate } from '../../../../src/application/estimate/estimate-types.js';
import { readerTokens } from '../../../../src/application/estimate/reader-estimate.js';
import type { Price } from '../../../../src/domain/budget/price.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import {
  areaOf,
  createEstimateHarness,
  projectWithScan,
} from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-425, RF-420, Q-56: the estimate prices a role at the tier its estimated prompt reaches. The
// prompt of one call is the average prompt of the role's calls for the low and likely figures and
// the largest one for the high figure. A reader prompt never passes the context share of the model
// (102,400 tokens), so a tier at 100,000 tokens is reached only by long conversations.

const tiered: Price = {
  provider: 'anthropic',
  model: 'claude-test',
  inputPerMillionMicros: 100_000n,
  outputPerMillionMicros: 500_000n,
  cachedInputPerMillionMicros: 10_000n,
  cacheWriteInputPerMillionMicros: 100_000n,
  longPrompt: {
    overInputTokens: 100_000,
    inputPerMillionMicros: 500_000n,
    outputPerMillionMicros: 2_500_000n,
    cachedInputPerMillionMicros: 50_000n,
    cacheWriteInputPerMillionMicros: 500_000n,
  },
  currency: 'USD',
};

const table: PriceTable = { version: '2026-10-21', currency: 'USD', prices: [tiered] };
const claudeRoles = settingsFor({
  reader: { provider: 'anthropic', model: 'claude-test' },
  verifier: { provider: 'anthropic', model: 'claude-test' },
  summariser: { provider: 'anthropic', model: 'claude-test' },
});

function ceilMillion(total: bigint): bigint {
  return (total + 999_999n) / 1_000_000n;
}

describe('the prompt of one call in the reader figures', () => {
  const assumptions = assumptionsOf(claudeRoles);
  const {
    turnsPerArea: turns,
    contextLimitTokens: limit,
    promptOverheadTokens: first,
  } = assumptions;

  it('RF-425 is the average prompt for low and likely and the largest for high', () => {
    const tokens = readerTokens([areaOf('Huge', 1_000_000)], assumptions);

    // Turn 1 sends the overhead; every later turn of a huge area is held at the context share.
    expect(limit).toBeGreaterThan(100_000);
    expect(tokens.low.promptTokens).toBe(Math.ceil((first + (turns.low - 1) * limit) / turns.low));
    expect(tokens.likely.promptTokens).toBe(
      Math.ceil((first + (turns.likely - 1) * limit) / turns.likely),
    );
    expect(tokens.high.promptTokens).toBe(limit);
  });

  it('RF-425 is zero for no areas', () => {
    expect(readerTokens([], assumptions).high.promptTokens).toBe(0);
  });
});

async function estimatedRoles(): Promise<readonly RoleEstimate[]> {
  const harness = createEstimateHarness([areaOf('Huge', 1_000_000)], [], table);
  const project = await projectWithScan(harness, userAmy.userId, claudeRoles);
  const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });
  if (!outcome.ok) throw new Error('The estimate failed');
  return outcome.value.roles;
}

describe('the estimate of a model priced by prompt length', () => {
  it('RF-420 prices the likely point at the lower tier and the high point at the higher tier', async () => {
    // The likely prompt averages under 100,000 tokens, the largest one is over it.
    const { likely } = readerTokens([areaOf('Huge', 1_000_000)], assumptionsOf(claudeRoles));
    expect(likely.promptTokens).toBeLessThanOrEqual(100_000);

    const reader = (await estimatedRoles()).find((each) => each.role === 'reader');
    if (reader === undefined) throw new Error('The estimate has no reader');
    const { likely: likelyPoint, high } = reader.points;

    // The cache-write price equals the input price in each tier, so a point is input and output.
    expect(likelyPoint.costMicros).toBe(
      ceilMillion(
        BigInt(likelyPoint.inputTokens) * 100_000n + BigInt(likelyPoint.outputTokens) * 500_000n,
      ),
    );
    expect(high.costMicros).toBe(
      ceilMillion(BigInt(high.inputTokens) * 500_000n + BigInt(high.outputTokens) * 2_500_000n),
    );
  });

  it('RF-420 prices the verifier, a share of the reader, at the reader prompt tier', async () => {
    const verifier = (await estimatedRoles()).find((each) => each.role === 'verifier');
    if (verifier === undefined) throw new Error('The estimate has no verifier');
    const { high } = verifier.points;

    expect(high.costMicros).toBe(
      ceilMillion(BigInt(high.inputTokens) * 500_000n + BigInt(high.outputTokens) * 2_500_000n),
    );
  });
});

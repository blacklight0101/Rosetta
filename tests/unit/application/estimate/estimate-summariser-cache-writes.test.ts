import { describe, expect, it } from 'vitest';
import { ceilPercent } from '../../../../src/application/estimate/estimate-assumptions.js';
import type { RunEstimate } from '../../../../src/application/estimate/estimate-types.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import type { PriceTable } from '../../../../src/domain/budget/price-table.js';
import {
  catalogAreas,
  createEstimateHarness,
  projectWithScan,
} from '../../../support/estimate-harness.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { userAmy } from '../../../support/run-harness.js';

// RF-425, RF-250, P2-24, P2-35: the batches after the first add the merge prompt and an answer to the
// summariser's figures, and no cache write: its cache-write tokens are its share of the readers',
// so on Anthropic the low and likely figures sit between the plain-price cost and the cost with
// every input token at the cache-write price.

const table: PriceTable = {
  version: '2026-10-11',
  currency: 'USD',
  prices: [
    {
      provider: 'anthropic',
      model: 'claude-test',
      inputPerMillionMicros: 3_000_000n,
      outputPerMillionMicros: 15_000_000n,
      cachedInputPerMillionMicros: 300_000n,
      cacheWriteInputPerMillionMicros: 3_750_000n,
      currency: 'USD',
    },
  ],
};

const roles = settingsFor({
  reader: { provider: 'anthropic', model: 'claude-test' },
  verifier: { provider: 'anthropic', model: 'claude-test' },
  summariser: { provider: 'anthropic', model: 'claude-test' },
});
/** Large answers, so the summariser's cards need several batches. */
const settings: ProjectSettings = {
  ...roles,
  roles: {
    ...roles.roles,
    reader: { ...roles.roles.reader, maxTurns: 50, maxOutputTokens: 32_768 },
  },
};

const SCENARIOS = ['low', 'likely', 'high'] as const;

async function estimateOf(): Promise<RunEstimate> {
  const harness = createEstimateHarness(catalogAreas, [], table);
  const project = await projectWithScan(harness, userAmy.userId, settings);
  const outcome = await harness.estimate.execute({ actor: userAmy, projectId: project.id });
  if (!outcome.ok) throw new Error('The estimate failed');
  return outcome.value;
}

/** The tokens the readers write to the cache in one scenario, over every area (as the estimate does). */
function readerWritten(estimate: RunEstimate, scenario: 'low' | 'likely'): number {
  const a = estimate.assumptions;
  const turns = a.turnsPerArea[scenario];
  const before = turns - 1;
  return estimate.areas.reduce((sum, area) => {
    const read = ceilPercent(area.estimatedTokens, a.readSharePercent[scenario]);
    const last =
      a.promptOverheadTokens +
      Math.floor((read * before) / turns) +
      a.outputTokensPerTurn[scenario] * before;
    return sum + Math.min(last, a.contextLimitTokens);
  }, 0);
}

function micros(
  point: { readonly inputTokens: number; readonly outputTokens: number },
  written: number,
): bigint {
  const total =
    BigInt(point.inputTokens - written) * 3_000_000n +
    BigInt(written) * 3_750_000n +
    BigInt(point.outputTokens) * 15_000_000n;
  return (total + 999_999n) / 1_000_000n;
}

describe('the summariser in the estimate, on Anthropic, in several batches', () => {
  it('RF-425 P2-35 needs more than one batch in the likely and high figures', async () => {
    const { summariserBatches } = (await estimateOf()).assumptions;

    for (const scenario of ['likely', 'high'] as const) {
      expect(summariserBatches[scenario]).toBeGreaterThan(1);
    }
  });

  it('RF-425 P2-35 costs more than the plain price and less than every input token written', async () => {
    const estimate = await estimateOf();
    const summariser = estimate.roles.find((role) => role.role === 'summariser');
    if (summariser === undefined) throw new Error('no summariser');

    for (const scenario of SCENARIOS) {
      const point = summariser.points[scenario];
      const all = micros(point, point.inputTokens);
      expect(point.costMicros).toBeGreaterThan(micros(point, 0));
      expect(point.costMicros).toBeLessThanOrEqual(all);
      // Only the high figure prices every input token at the cache-write price.
      expect(point.costMicros === all).toBe(scenario === 'high');
    }
  });

  it('RF-425 P2-35 writes its share of the readers to the cache, not the share plus the extra batches', async () => {
    const estimate = await estimateOf();
    const summariser = estimate.roles.find((role) => role.role === 'summariser');
    if (summariser === undefined) throw new Error('no summariser');

    for (const scenario of ['low', 'likely'] as const) {
      const share = ceilPercent(
        readerWritten(estimate, scenario),
        estimate.assumptions.summariserSharePercent[scenario],
      );
      const point = summariser.points[scenario];
      expect(point.costMicros).toBe(micros(point, share));
    }
  });
});

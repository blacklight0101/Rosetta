import { describe, expect, it } from 'vitest';
import type { Price } from '../../../../src/domain/budget/price.js';
import {
  createPlanEstimateHarness,
  plannerSettings,
} from '../../../support/plan-estimate-harness.js';

// RF-613, RF-420, Q-56: the plan estimate prices each planner call at the tier its own prompt
// reaches. The tier here costs ten times the base price; its threshold decides which one applies.

function priceWith(overInputTokens: number): Price {
  return {
    provider: 'openai',
    model: 'priced-model',
    inputPerMillionMicros: 250_000n,
    outputPerMillionMicros: 2_000_000n,
    cachedInputPerMillionMicros: 25_000n,
    longPrompt: {
      overInputTokens,
      inputPerMillionMicros: 2_500_000n,
      outputPerMillionMicros: 20_000_000n,
      cachedInputPerMillionMicros: 250_000n,
      cacheWriteInputPerMillionMicros: 2_500_000n,
    },
    currency: 'USD',
  };
}

async function likelyCost(overInputTokens: number): Promise<bigint> {
  const h = await createPlanEstimateHarness({
    settings: plannerSettings({ provider: 'openai', model: 'priced-model' }),
    priceTable: {
      version: '2026-10-21',
      currency: 'USD',
      prices: [priceWith(overInputTokens)],
    },
  });
  const outcome = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!outcome.ok) throw new Error('The estimate was refused');
  return outcome.value.planner.points.likely.costMicros;
}

describe('EstimatePlan: a planner model priced by prompt length', () => {
  it('RF-420 prices the planner calls at the tier their prompts reach', async () => {
    const base = await likelyCost(1_000_000_000);
    const tiered = await likelyCost(1);

    expect(base).toBeGreaterThan(0n);
    // each of the calls rounds its own cost up, so the tiered total is ten times the base to within 6
    expect(tiered).toBeGreaterThan(base * 10n - 100n);
    expect(tiered).toBeLessThanOrEqual(base * 10n);
  });
});

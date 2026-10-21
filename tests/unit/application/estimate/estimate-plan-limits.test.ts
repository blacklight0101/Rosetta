import { describe, expect, it } from 'vitest';
import type { ModelList } from '../../../../src/application/models/model-list.js';
import {
  createPlanEstimateHarness,
  plannerSettings,
} from '../../../support/plan-estimate-harness.js';
import { withoutOutputLimits } from '../../../support/output-limits.js';

// RF-613, RF-405, Q-57: the plan estimate uses the output limit and the context window of the
// planner's model; a limit the project sets wins; a local planner keeps its own default.

const list: ModelList = {
  version: '2026-10-21',
  models: [
    {
      ...{ provider: 'openai', model: 'priced-model', label: 'Priced model' },
      ...{ contextTokens: 400_000, maxOutputTokens: 128_000 },
    },
    {
      ...{ provider: 'openai', model: 'small-output', label: 'Small output' },
      ...{ contextTokens: 100_000, maxOutputTokens: 8_000 },
    },
  ],
};

async function assumptionsOf(model: string, kind = 'openai', limit?: number) {
  const base = withoutOutputLimits(plannerSettings({ provider: kind, model }));
  const planner =
    limit === undefined ? base.roles.planner : { ...base.roles.planner, maxOutputTokens: limit };
  const h = await createPlanEstimateHarness({
    settings: { ...base, roles: { ...base.roles, planner } },
    models: list,
  });
  const outcome = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!outcome.ok) throw new Error('The estimate was refused');
  return outcome.value.assumptions;
}

describe('the planner limits of the plan estimate', () => {
  it('Q-57 a hosted planner uses 16,384 output tokens and keeps 128,000 tokens of context', async () => {
    const assumptions = await assumptionsOf('priced-model');

    expect(assumptions.maxOutputTokens).toBe(16_384);
    expect(assumptions.contextTokens).toBe(128_000);
  });

  it('Q-57 the default never exceeds the maximum output of the model', async () => {
    expect((await assumptionsOf('small-output')).maxOutputTokens).toBe(8_000);
  });

  it('Q-57 an output limit the project sets wins', async () => {
    expect((await assumptionsOf('priced-model', 'openai', 5_000)).maxOutputTokens).toBe(5_000);
  });

  it('P3-64 a local planner keeps 16,384 output tokens and the 32,768 floor of context', async () => {
    const assumptions = await assumptionsOf('gemma4:e4b', 'ollama');

    expect(assumptions.maxOutputTokens).toBe(16_384);
    expect(assumptions.contextTokens).toBe(32_768);
  });
});

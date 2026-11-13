import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createPlanEstimateHarness,
  plannerSettings,
  type PlanEstimateOptions,
} from '../../../support/plan-estimate-harness.js';
import { planCards } from '../../../support/plan-cards.js';

// P9-15, RF-623, RF-613, ADR-007: the plan estimate counts the check of the data model against the
// decision records. Whether a record names a stored structure is not known before the run, so the
// call is counted whenever the data model call is (a supported ENT claim exists), sized for a
// typical plan; a run whose records name none makes one call fewer than the estimate says.

async function estimateOf(options: PlanEstimateOptions = {}) {
  const h = await createPlanEstimateHarness({
    settings: plannerSettings({ provider: 'openai', model: 'priced-model' }),
    ...options,
  });
  const result = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!result.ok) throw new Error('The estimate was refused');
  return result.value;
}

describe('EstimatePlan: the check of the data model against the decision records', () => {
  it('RF-613 RF-623 P9-15 counts the call with its own measured prompt when a data model is asked', async () => {
    const { assumptions, planner } = await estimateOf();

    const system = (await readFile('prompts/planner/adr-model.v1.md', 'utf8')).length;
    expect(assumptions.calls).toBe(8);
    expect(assumptions.adrModelPromptTokens).toBeGreaterThan(Math.ceil(system / 4));
    expect(assumptions.promptTokens).toBeGreaterThan(assumptions.adrModelPromptTokens);
    expect(planner.points.high.outputTokens).toBe(8 * 3 * assumptions.maxOutputTokens);
  });

  it('RF-613 RF-623 P9-15 does not count it when no data model call is made', async () => {
    const cards = planCards().filter((card) => card.type !== 'ENT');
    const { assumptions } = await estimateOf({ seed: { cards } });

    expect(assumptions).toMatchObject({ calls: 6, adrModelPromptTokens: 0 });
  });
});

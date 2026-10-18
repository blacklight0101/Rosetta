import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createPlanEstimateHarness,
  plannerSettings,
  type PlanEstimateOptions,
} from '../../../support/plan-estimate-harness.js';
import { planCards } from '../../../support/plan-cards.js';

// RF-613, RF-623, ADR-007: the plan estimate counts the data model call (the planner's third) when
// a supported ENT claim exists, measured the way the budget guard measures it, and not otherwise.

async function estimateOf(options: PlanEstimateOptions = {}) {
  const h = await createPlanEstimateHarness({
    settings: plannerSettings({ provider: 'openai', model: 'priced-model' }),
    ...options,
  });
  const result = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!result.ok) throw new Error('The estimate was refused');
  return result.value;
}

describe('EstimatePlan: the data model call', () => {
  it('RF-613 RF-623 counts the data model call when a supported ENT claim exists, with its own measured prompt', async () => {
    const estimate = await estimateOf();

    const { assumptions, planner } = estimate;
    const system = (await readFile('prompts/planner/data-model.v1.md', 'utf8')).length;
    expect(assumptions.calls).toBe(3);
    expect(assumptions.dataModelPromptTokens).toBeGreaterThan(Math.ceil(system / 4));
    expect(planner.points.high.inputTokens).toBe(assumptions.promptTokens);
    expect(planner.points.high.outputTokens).toBe(3 * assumptions.maxOutputTokens);
  });

  it('RF-613 RF-623 does not count it when no ENT claim is supported, since no call is made', async () => {
    const cards = planCards().filter((card) => card.type !== 'ENT');
    const estimate = await estimateOf({ seed: { cards } });

    const { assumptions, planner } = estimate;
    expect(assumptions).toMatchObject({ calls: 2, dataModelPromptTokens: 0 });
    expect(planner.points.high.outputTokens).toBe(2 * assumptions.maxOutputTokens);
    expect(planner.points.high.inputTokens).toBe(assumptions.promptTokens);
  });

  it('RF-613 the high figure is the sum of the guard reservations of the three calls', async () => {
    const estimate = await estimateOf();

    const { assumptions, planner } = estimate;
    const reservation = (promptTokens: number): number =>
      promptTokens + assumptions.maxOutputTokens;
    const plan =
      assumptions.promptTokens -
      assumptions.prdPromptTokens -
      assumptions.dataModelPromptTokens -
      assumptions.flowsPromptTokens;
    const sum =
      reservation(plan) +
      reservation(assumptions.prdPromptTokens) +
      reservation(assumptions.dataModelPromptTokens);
    expect(planner.points.high.inputTokens + planner.points.high.outputTokens).toBe(sum);
  });
});

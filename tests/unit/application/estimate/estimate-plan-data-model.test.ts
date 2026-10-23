import { continuePromptTokens } from '../../../../src/application/estimate/plan-continuation-reserve.js';
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
    const system = (await readFile('prompts/planner/data-model.v2.md', 'utf8')).length;
    expect(assumptions.calls).toBe(6);
    expect(assumptions.dataModelPromptTokens).toBeGreaterThan(Math.ceil(system / 4));
    expect(planner.points.low.inputTokens).toBe(assumptions.promptTokens);
    expect(planner.points.high.outputTokens).toBe(6 * 3 * assumptions.maxOutputTokens);
  });

  it('RF-613 RF-623 does not count it when no ENT claim is supported, since no call is made', async () => {
    const cards = planCards().filter((card) => card.type !== 'ENT');
    const estimate = await estimateOf({ seed: { cards } });

    const { assumptions, planner } = estimate;
    expect(assumptions).toMatchObject({ calls: 5, dataModelPromptTokens: 0 });
    expect(planner.points.high.outputTokens).toBe(5 * 3 * assumptions.maxOutputTokens);
    expect(planner.points.low.inputTokens).toBe(assumptions.promptTokens);
  });

  it('RF-613 the high figure is the sum of the guard reservations of the three calls', async () => {
    const estimate = await estimateOf();

    const { assumptions, planner } = estimate;
    const reservation = (promptTokens: number): number =>
      3 * promptTokens + 6 * assumptions.maxOutputTokens + 2 * continuePromptTokens;
    const plan =
      assumptions.promptTokens -
      assumptions.prdPromptTokens -
      assumptions.dataModelPromptTokens -
      assumptions.flowsPromptTokens -
      assumptions.coveragePromptTokens -
      assumptions.gapPromptTokens -
      assumptions.gapRepairPromptTokens;
    const sum =
      reservation(plan) +
      reservation(assumptions.prdPromptTokens) +
      reservation(assumptions.dataModelPromptTokens) +
      reservation(assumptions.coveragePromptTokens) +
      reservation(assumptions.gapPromptTokens) +
      reservation(assumptions.gapRepairPromptTokens);
    expect(planner.points.high.inputTokens + planner.points.high.outputTokens).toBe(sum);
  });
});

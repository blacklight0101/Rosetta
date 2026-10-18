import { continuePromptTokens } from '../../../../src/application/estimate/plan-continuation-reserve.js';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createPlanEstimateHarness,
  plannerSettings,
  type PlanEstimateOptions,
} from '../../../support/plan-estimate-harness.js';
import { orderFlowCards, planCards } from '../../../support/plan-cards.js';

// RF-613, RF-625, ADR-007: the plan estimate counts the target flows call (the planner's fourth)
// when a verified FLOW card exists, measured the way the budget guard measures it, with the
// components the plan will name sized at the limits of the plan answer; and not otherwise.

const withFlows = { cards: [...planCards(), ...orderFlowCards()] };

async function estimateOf(options: PlanEstimateOptions = {}) {
  const h = await createPlanEstimateHarness({
    settings: plannerSettings({ provider: 'openai', model: 'priced-model' }),
    seed: withFlows,
    ...options,
  });
  const result = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!result.ok) throw new Error('The estimate was refused');
  return result.value;
}

describe('EstimatePlan: the target flows call', () => {
  it('RF-613 RF-625 counts the flows call when a verified FLOW card exists, with its own measured prompt', async () => {
    const { assumptions, planner } = await estimateOf();

    const system = (await readFile('prompts/planner/flows.v1.md', 'utf8')).length;
    expect(assumptions.calls).toBe(4);
    expect(assumptions.flowsPromptTokens).toBeGreaterThan(Math.ceil(system / 4));
    expect(planner.points.low.inputTokens).toBe(assumptions.promptTokens);
    expect(planner.points.high.outputTokens).toBe(4 * 3 * assumptions.maxOutputTokens);
  });

  it('RF-613 RF-625 does not count it when no FLOW card has a supported step, since no call is made', async () => {
    const { assumptions, planner } = await estimateOf({ seed: { cards: planCards() } });

    expect(assumptions).toMatchObject({ calls: 3, flowsPromptTokens: 0 });
    expect(planner.points.high.outputTokens).toBe(3 * 3 * assumptions.maxOutputTokens);
  });

  it('RF-613 the high figure is the sum of the guard reservations of the four calls', async () => {
    const { assumptions, planner } = await estimateOf();

    const reservation = (promptTokens: number): number =>
      3 * promptTokens + 6 * assumptions.maxOutputTokens + 2 * continuePromptTokens;
    const plan =
      assumptions.promptTokens -
      assumptions.prdPromptTokens -
      assumptions.dataModelPromptTokens -
      assumptions.flowsPromptTokens;
    const sum =
      reservation(plan) +
      reservation(assumptions.prdPromptTokens) +
      reservation(assumptions.dataModelPromptTokens) +
      reservation(assumptions.flowsPromptTokens);
    expect(planner.points.high.inputTokens + planner.points.high.outputTokens).toBe(sum);
  });

  it('RF-625 sizes the components the plan will name at the limits of its answer', async () => {
    const { assumptions } = await estimateOf();

    // A control character is six characters once JSON-escaped, the worst a model text can cost.
    const escaped = 50 * 6 * (200 + 300);
    expect(assumptions.flowsPromptTokens).toBeGreaterThan(Math.ceil(escaped / 4));
  });
});

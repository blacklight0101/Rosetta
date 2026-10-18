import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createPlanEstimateHarness,
  plannerSettings,
} from '../../../support/plan-estimate-harness.js';
import { planCards } from '../../../support/plan-cards.js';

// RF-613, RF-627, ADR-007: the plan estimate counts the coverage call (the planner's last) as the
// budget guard will measure it. The links are not known before the run, so the call is counted
// whenever the plan call is made: the estimate stays an upper bound.

async function estimateOf() {
  const h = await createPlanEstimateHarness({
    settings: plannerSettings({ provider: 'openai', model: 'priced-model' }),
    seed: { cards: planCards() },
  });
  const result = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!result.ok) throw new Error('The estimate was refused');
  return result.value;
}

describe('EstimatePlan: the coverage call', () => {
  it('RF-613 RF-627 counts the coverage call, with its own measured prompt', async () => {
    const { assumptions } = await estimateOf();

    const system = (await readFile('prompts/planner/coverage.v1.md', 'utf8')).length;
    expect(assumptions.calls).toBe(4);
    expect(assumptions.coveragePromptTokens).toBeGreaterThan(Math.ceil(system / 4));
  });

  it('RF-613 the high figure is the sum of the guard reservations of the four calls', async () => {
    const { assumptions, planner } = await estimateOf();

    const reservation = (promptTokens: number): number =>
      promptTokens + assumptions.maxOutputTokens;
    const plan =
      assumptions.promptTokens -
      assumptions.prdPromptTokens -
      assumptions.dataModelPromptTokens -
      assumptions.coveragePromptTokens;
    const sum = [
      plan,
      assumptions.prdPromptTokens,
      assumptions.dataModelPromptTokens,
      assumptions.coveragePromptTokens,
    ]
      .map(reservation)
      .reduce((total, each) => total + each, 0);
    expect(planner.points.high.inputTokens + planner.points.high.outputTokens).toBe(sum);
  });
});

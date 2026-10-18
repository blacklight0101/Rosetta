import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createPlanEstimateHarness,
  plannerSettings,
  type PlanEstimateOptions,
} from '../../../support/plan-estimate-harness.js';
import { planCards } from '../../../support/plan-cards.js';
import { orderScreenCards } from '../../../support/plan-screen-cards.js';

// RF-613, RF-626, ADR-007: the plan estimate counts the screens call (the planner's last) when a
// verified SCRN card exists, measured the way the budget guard measures it, and not otherwise.
// With no FLOW card and no front end the other calls have fixed sizes too, so the high figure is
// exactly the sum of the guard reservations.

const withScreens = { cards: [...planCards(), ...orderScreenCards()] };

async function estimateOf(options: PlanEstimateOptions = {}) {
  const h = await createPlanEstimateHarness({
    settings: plannerSettings({ provider: 'openai', model: 'priced-model' }),
    seed: withScreens,
    ...options,
  });
  const result = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!result.ok) throw new Error('The estimate was refused');
  return result.value;
}

describe('EstimatePlan: the screens call', () => {
  it('RF-613 RF-626 counts the screens call when a verified SCRN card exists, with its own measured prompt', async () => {
    const { assumptions, planner } = await estimateOf();

    const system = (await readFile('prompts/planner/ux.v1.md', 'utf8')).length;
    expect(assumptions.calls).toBe(4);
    expect(assumptions.uxPromptTokens).toBeGreaterThan(Math.ceil(system / 4));
    expect(planner.points.high.inputTokens).toBe(assumptions.promptTokens);
    expect(planner.points.high.outputTokens).toBe(4 * assumptions.maxOutputTokens);
  });

  it('RF-613 RF-626 does not count it when no SCRN card has a supported claim, since no call is made', async () => {
    const { assumptions, planner } = await estimateOf({ seed: { cards: planCards() } });

    expect(assumptions).toMatchObject({ calls: 3, uxPromptTokens: 0 });
    expect(planner.points.high.outputTokens).toBe(3 * assumptions.maxOutputTokens);
  });

  it('RF-613 the high figure is the sum of the guard reservations of the four calls', async () => {
    const { assumptions, planner } = await estimateOf();

    const reservation = (promptTokens: number): number =>
      promptTokens + assumptions.maxOutputTokens;
    const plan =
      assumptions.promptTokens -
      assumptions.prdPromptTokens -
      assumptions.dataModelPromptTokens -
      assumptions.uxPromptTokens;
    const sum = [
      plan,
      assumptions.prdPromptTokens,
      assumptions.dataModelPromptTokens,
      assumptions.uxPromptTokens,
    ]
      .map(reservation)
      .reduce((total, each) => total + each, 0);
    expect(planner.points.high.inputTokens + planner.points.high.outputTokens).toBe(sum);
  });

  it('RF-613 the screens call is counted together with the flows and the API contract', async () => {
    const frontEnd = { stack: [{ layer: 'front-end', choice: 'React', custom: false }] } as const;

    const { assumptions } = await estimateOf({ seed: { ...withScreens, briefAnswers: frontEnd } });

    expect(assumptions.calls).toBe(5);
    expect(assumptions.apiContractPromptTokens).toBeGreaterThan(0);
    expect(assumptions.uxPromptTokens).toBeGreaterThan(0);
  });
});

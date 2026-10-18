import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  createPlanEstimateHarness,
  plannerSettings,
  type PlanEstimateOptions,
} from '../../../support/plan-estimate-harness.js';
import { planCards } from '../../../support/plan-cards.js';

// RF-613, RF-624, ADR-007: the plan estimate counts the API contract call (the planner's fourth)
// when the brief names a front end and a verified FEAT or FLOW card exists, measured the way the
// budget guard measures it, and not otherwise.

const frontEnd = { stack: [{ layer: 'front-end', choice: 'React', custom: false }] } as const;

async function estimateOf(options: PlanEstimateOptions = {}) {
  const h = await createPlanEstimateHarness({
    settings: plannerSettings({ provider: 'openai', model: 'priced-model' }),
    ...options,
  });
  const result = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!result.ok) throw new Error('The estimate was refused');
  return result.value;
}

describe('EstimatePlan: the API contract call', () => {
  it('RF-613 RF-624 counts the API contract call when a front end is chosen and a FEAT card is verified, with its own measured prompt', async () => {
    const { assumptions, planner } = await estimateOf({ seed: { briefAnswers: frontEnd } });

    const system = (await readFile('prompts/planner/api-contract.v1.md', 'utf8')).length;
    expect(assumptions.calls).toBe(4);
    expect(assumptions.apiContractPromptTokens).toBeGreaterThan(Math.ceil(system / 4));
    expect(planner.points.high.inputTokens).toBe(assumptions.promptTokens);
    expect(planner.points.high.outputTokens).toBe(4 * assumptions.maxOutputTokens);
  });

  it('RF-613 RF-624 does not count it when the brief names no front end, since no call is made', async () => {
    const { assumptions, planner } = await estimateOf();

    expect(assumptions).toMatchObject({ calls: 3, apiContractPromptTokens: 0 });
    expect(planner.points.high.outputTokens).toBe(3 * assumptions.maxOutputTokens);
  });

  it('RF-613 RF-624 does not count it when no FEAT or FLOW card is verified', async () => {
    const cards = planCards().filter((card) => card.type !== 'FEAT');

    const { assumptions } = await estimateOf({ seed: { cards, briefAnswers: frontEnd } });

    expect(assumptions).toMatchObject({ calls: 3, apiContractPromptTokens: 0 });
  });

  it('RF-613 the high figure is the sum of the guard reservations of the four calls', async () => {
    const { assumptions, planner } = await estimateOf({ seed: { briefAnswers: frontEnd } });

    const reservation = (promptTokens: number): number =>
      promptTokens + assumptions.maxOutputTokens;
    const plan =
      assumptions.promptTokens -
      assumptions.prdPromptTokens -
      assumptions.dataModelPromptTokens -
      assumptions.apiContractPromptTokens;
    const sum = [
      plan,
      assumptions.prdPromptTokens,
      assumptions.dataModelPromptTokens,
      assumptions.apiContractPromptTokens,
    ]
      .map(reservation)
      .reduce((total, each) => total + each, 0);
    expect(planner.points.high.inputTokens + planner.points.high.outputTokens).toBe(sum);
  });
});

import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { continuePromptTokens } from '../../../../src/application/estimate/plan-continuation-reserve.js';
import { planCards } from '../../../support/plan-cards.js';
import {
  createPlanEstimateHarness,
  plannerSettings,
} from '../../../support/plan-estimate-harness.js';

// Q-45, RF-613, RF-627, ADR-007: the plan estimate counts the planner's call for the items no task
// card builds. Whether any item will be left without a card is not known before the run, so the
// call is counted whenever a plan is written (as the coverage call is) and the estimate stays an
// upper bound; a run whose cards build everything makes one call fewer than the estimate says.

async function estimateOf() {
  const h = await createPlanEstimateHarness({
    settings: plannerSettings({ provider: 'openai', model: 'priced-model' }),
    seed: { cards: planCards() },
  });
  const result = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!result.ok) throw new Error('The estimate was refused');
  return result.value;
}

describe('EstimatePlan: the call for the items no task card builds', () => {
  it('Q-45 counts the gap call, with its own measured prompt, after the coverage call', async () => {
    const { assumptions } = await estimateOf();

    const system = (await readFile('prompts/planner/gap.v1.md', 'utf8')).length;
    expect(assumptions.calls).toBe(6);
    expect(assumptions.gapPromptTokens).toBeGreaterThan(Math.ceil(system / 4));
    expect(assumptions.gapPromptTokens).not.toBe(assumptions.coveragePromptTokens);
  });

  it('Q-45 the high figure reserves the gap call with its continuations, like every other call', async () => {
    const { assumptions, planner } = await estimateOf();

    const reservation = (promptTokens: number): number =>
      3 * promptTokens + 6 * assumptions.maxOutputTokens + 2 * continuePromptTokens;
    const high = planner.points.high.inputTokens + planner.points.high.outputTokens;
    expect(high).toBeGreaterThan(reservation(assumptions.gapPromptTokens));
    expect(planner.points.low.inputTokens).toBe(assumptions.promptTokens);
    expect(planner.points.high.outputTokens).toBe(6 * 3 * assumptions.maxOutputTokens);
  });
});

describe('EstimatePlan: the repair attempt of the call for the items no task card builds', () => {
  it('Q-54 RF-627 counts the repair call after the gap call, with the gap prompt and the repair prompt measured', async () => {
    const { assumptions } = await estimateOf();

    const system = (await readFile('prompts/planner/gap.v1.md', 'utf8')).length;
    const repair = (await readFile('prompts/planner/gap-repair.v1.md', 'utf8')).length;
    expect(assumptions.gapRepairPromptTokens).toBeGreaterThan(
      assumptions.gapPromptTokens + Math.ceil(repair / 4) - 1,
    );
    expect(assumptions.gapPromptTokens).toBeGreaterThan(Math.ceil(system / 4));
  });

  it('Q-54 the repair is in the total of the prompts and the high figure reserves it with its continuations', async () => {
    const { assumptions, planner } = await estimateOf();

    const reservation = (promptTokens: number): number =>
      3 * promptTokens + 6 * assumptions.maxOutputTokens + 2 * continuePromptTokens;
    const high = planner.points.high.inputTokens + planner.points.high.outputTokens;
    expect(high).toBeGreaterThan(
      reservation(assumptions.gapPromptTokens) + reservation(assumptions.gapRepairPromptTokens),
    );
    expect(assumptions.promptTokens).toBeGreaterThan(
      assumptions.gapPromptTokens + assumptions.gapRepairPromptTokens,
    );
  });
});

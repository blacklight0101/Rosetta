import { expect, it } from 'vitest';
import {
  createPlanEstimateHarness,
  plannerSettings,
} from '../../../support/plan-estimate-harness.js';

// RF-604, RF-613, ADR-007: a planner call whose answer is cut off is continued up to twice, so the
// high figure (the guard's worst case) reserves three answers per call: the output of each call
// three times, and the input of each continuation holds the answer so far.

it('RF-613 the high figure reserves two continuations per planner call; low and likely do not', async () => {
  const h = await createPlanEstimateHarness({
    settings: plannerSettings({ provider: 'openai', model: 'priced-model' }),
  });
  const outcome = await h.estimate.execute({ actor: h.actor, projectId: h.project.id });
  if (!outcome.ok) throw new Error('The estimate was refused');
  const { planner, assumptions } = outcome.value;
  const { calls, maxOutputTokens: limit, promptTokens } = assumptions;

  expect(assumptions.continuationsPerCall).toBe(2);
  expect(planner.points.high.outputTokens).toBe(calls * 3 * limit);
  expect(planner.points.low.outputTokens).toBe(calls * Math.ceil(limit * 0.25));
  expect(planner.points.likely.outputTokens).toBe(calls * Math.ceil(limit * 0.5));
  expect(planner.points.low.inputTokens).toBe(promptTokens);
  expect(planner.points.likely.inputTokens).toBe(promptTokens);
  expect(planner.points.high.inputTokens).toBeGreaterThanOrEqual(
    3 * promptTokens + calls * 3 * limit,
  );
});

import { maxPlannerContinuations } from '../plan/plan-continuation.js';

// RF-604, RF-613, ADR-007: what the high figure of the plan estimate reserves for the continuations
// of a planner call whose answer is cut off every time.

/** The tokens of the continue prompt (planner/continue.vN.md is about 110), rounded up. */
export const continuePromptTokens = 120;

/**
 * RF-604: the worst case of one call whose answer is cut off every time: the call and each of its
 * continuations write the whole limit, and the input of a continuation holds the answer so far.
 */
export function reservedWithContinuations(
  promptTokens: number,
  limit: number,
): { readonly inputTokens: number; readonly outputTokens: number } {
  let inputTokens = promptTokens;
  for (let each = 1; each <= maxPlannerContinuations; each += 1) {
    inputTokens += promptTokens + each * limit + continuePromptTokens;
  }
  return { inputTokens, outputTokens: (1 + maxPlannerContinuations) * limit };
}

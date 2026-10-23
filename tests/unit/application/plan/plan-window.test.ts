import { describe, expect, it } from 'vitest';
import { plannerWindowTokens } from '../../../../src/application/plan/plan-window.js';

// P3-113, EV-29, RF-405, Q-57, P3-75: the window the planner's prompt is packed to: the project's
// number up to the model's window, else the model's window from the shipped list, else Ollama's
// trained context (an automatic context grows to it) or the 128,000 tokens a hosted model keeps.

describe('plannerWindowTokens', () => {
  it('RF-405 takes the number the project sets, never above the model window', () => {
    expect(plannerWindowTokens(131_072, 'ollama', undefined)).toBe(131_072);
    expect(plannerWindowTokens(2_000_000, 'anthropic', 1_000_000)).toBe(1_000_000);
  });

  it('Q-57 takes the window of the shipped list for a hosted model with no number set', () => {
    expect(plannerWindowTokens(undefined, 'anthropic', 1_000_000)).toBe(1_000_000);
  });

  it('Q-57 keeps 128,000 tokens for a hosted model the list gives no window', () => {
    expect(plannerWindowTokens(undefined, 'openai', undefined)).toBe(128_000);
  });

  it('P3-75 plans an automatic Ollama context for the window it grows to', () => {
    expect(plannerWindowTokens('auto', 'ollama', undefined)).toBe(131_072);
    expect(plannerWindowTokens(undefined, 'ollama', undefined)).toBe(131_072);
  });
});

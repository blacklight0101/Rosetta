import { promptBudgetTokens, type PlanWindow } from '../plan/plan-packing.js';
import type { PlannedCallKind } from './plan-estimate-prompts.js';

// P3-113, EV-29, RF-613: what the plan estimate says of the planner's window: which window the
// prompts were packed to, how many cards a call names by title only, and the calls that are over
// the window's budget even so (they would end RST-1522 when the run sends them).

export interface WindowFacts {
  readonly windowTokens: number;
  readonly fitsWindow: boolean;
  readonly oversizedCalls: readonly PlannedCallKind[];
  readonly omittedCards: number;
}

// P3-113
export function windowFacts(
  window: PlanWindow,
  calls: readonly { readonly kind: PlannedCallKind; readonly omitted: number }[],
  promptTokens: readonly number[],
): WindowFacts {
  const budget = promptBudgetTokens(window);
  const oversizedCalls = calls.flatMap((call, at) =>
    (promptTokens[at] ?? 0) > budget ? [call.kind] : [],
  );
  return {
    windowTokens: window.windowTokens,
    fitsWindow: oversizedCalls.length === 0,
    oversizedCalls,
    omittedCards: Math.max(0, ...calls.map((call) => call.omitted)),
  };
}

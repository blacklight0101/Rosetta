import type { SourceCard } from '../../domain/planning/plan-sources.js';

// P3-113 (stub: the tests of the card fail on it first).

export interface PlanWindow {
  readonly windowTokens: number;
  readonly maxOutputTokens: number;
}

export interface Packing {
  readonly omitted: ReadonlySet<string>;
  readonly promptTokens: number;
  readonly budgetTokens: number | undefined;
  readonly fits: boolean;
}

export function promptBudgetTokens(window: PlanWindow): number {
  return window.windowTokens;
}

export function omittedSummary(cards: readonly SourceCard[]): string {
  return cards.length === 0 ? '' : '';
}

export function packCards(request: {
  readonly window: PlanWindow | undefined;
  readonly system: string;
  readonly cards: readonly SourceCard[];
  readonly render: (omitted: ReadonlySet<string>) => string;
}): Packing {
  const omitted = new Set<string>();
  return {
    omitted,
    promptTokens: request.render(omitted).length,
    budgetTokens: undefined,
    fits: true,
  };
}

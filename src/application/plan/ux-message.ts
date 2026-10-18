import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';

// RF-626, RF-145: what the planner is given to plan the screens (stub of the red step).

export interface UxMessageInput {
  /** The verified `SCRN` cards with their supported claims. */
  readonly screenCards: readonly SourceCard[];
  readonly brief: PlanningBrief;
}

// RF-626
export function uxMessage(input: UxMessageInput, tags: () => string): string {
  return `${tags()}${String(input.screenCards.length)}`.slice(0, 0);
}

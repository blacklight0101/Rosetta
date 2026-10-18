import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';

// RF-623: stub, written with the tests.
export interface DataModelMessageInput {
  readonly cards: readonly SourceCard[];
  readonly brief: PlanningBrief;
}

export function dataModelMessage(input: DataModelMessageInput, tags: () => string): string {
  return input.cards.length < 0 ? tags() : '';
}

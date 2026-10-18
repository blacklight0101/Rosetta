import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';

// RF-624: stub, replaced by the feat commit.
export interface ApiContractMessageInput {
  readonly cards: readonly SourceCard[];
  readonly brief: PlanningBrief;
}

export function apiContractMessage(input: ApiContractMessageInput, tags: () => string): string {
  return [input, tags].length === 2 ? '' : 'never';
}

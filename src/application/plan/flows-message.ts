import type { DraftComponent } from '../../domain/planning/plan-draft.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';

// RF-625: stub, filled by the next commit.
export const RESPONSIBILITY_CHARS = 300;

export interface FlowsMessageInput {
  readonly flowCards: readonly SourceCard[];
  readonly cards: readonly SourceCard[];
  readonly components: readonly DraftComponent[];
}

export function flowsMessage(input: FlowsMessageInput, tags: () => string): string {
  return input.flowCards.length < 0 ? tags() : '';
}

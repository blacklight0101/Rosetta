import type { Catalogue } from '../../domain/planning/catalogue.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { RecordedQuestion } from '../ports/answers-file.js';

// RF-604, RF-145: what the planner is given (not built yet).

export interface PlanMessageInput {
  readonly cards: readonly SourceCard[];
  readonly brief: PlanningBrief;
  readonly catalogue: Catalogue;
  /** Only the questions with an answer. */
  readonly answered: readonly RecordedQuestion[];
}

// RF-604, RF-145
export const planMessage: (input: PlanMessageInput, tags: () => string) => string = () => '';

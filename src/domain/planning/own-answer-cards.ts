import type { PlanContent } from './plan-content.js';
import type { PlanningBrief } from './planning-brief.js';

// Stub: the cards do not follow the own answers yet (P6-21 round 3, test first).

/** The decision records of the own answers: the style and the migration strategy. */
export interface OwnAnswerRecords {
  readonly style: string;
  readonly migration: string;
}

/* eslint-disable @typescript-eslint/no-unused-vars -- a stub until the fix commit */
export function withOwnAnswerCards(
  content: PlanContent,
  _brief: Pick<PlanningBrief, 'defaulted' | 'typed'>,
  _records: OwnAnswerRecords,
): PlanContent {
  return content;
}
/* eslint-enable @typescript-eslint/no-unused-vars */

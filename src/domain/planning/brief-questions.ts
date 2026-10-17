import type { Catalogue } from './catalogue.js';
import type { PlanningBrief } from './planning-brief.js';

// RF-604, DEC-80: the brief's questions that took their default (not built yet).

export interface DefaultedQuestion {
  /** The id in `defaulted`, for example `migration` or `stack.database`. */
  readonly id: string;
  readonly question: string;
  /** The value the package used, in words. */
  readonly answer: string;
}

// RF-604
export const defaultedQuestions: (
  brief: PlanningBrief,
  catalogue: Catalogue,
) => DefaultedQuestion[] = () => [];

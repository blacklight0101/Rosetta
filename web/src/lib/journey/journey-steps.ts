import type { JourneyFacts } from '../../api/journey-schemas.js';

// RF-615, RF-614, DEC-143: skeleton, filled in by the feature commit.

export type StepKey =
  'scan' | 'understand' | 'questions' | 'brief' | 'estimate' | 'plan' | 'package';

/** `current` is the step that holds the next action; `upcoming` is open but not yet reached. */
export type StepState = 'done' | 'current' | 'upcoming' | 'locked' | 'failed' | 'out-of-date';

export interface JourneyStep {
  readonly key: StepKey;
  readonly title: string;
  readonly state: StepState;
  /** The reason a step is locked, the code a step failed with, or what the step did. */
  readonly detail: string;
  readonly cost: string;
  /** The page of the step; none for a step the user may not open. */
  readonly href: string | undefined;
  /** The step that holds the next action, whatever its state. */
  readonly here: boolean;
}

export type JourneyAction =
  | { readonly kind: 'link'; readonly label: string; readonly href: string }
  | { readonly kind: 'resume'; readonly label: string; readonly runId: string };

export interface JourneyView {
  readonly steps: readonly JourneyStep[];
  /** The one next action; none while a run works. */
  readonly action: JourneyAction | undefined;
  readonly totalCostMicros: number;
}

export function journeyOf(facts: JourneyFacts, projectId: string): JourneyView {
  return {
    steps: [],
    action: undefined,
    totalCostMicros: facts.source === null ? projectId.length : 0,
  };
}

import type { DraftTask } from './plan-draft.js';

// RF-627, RF-630, RF-631: what code did to the requirements of the task cards, or found wrong in
// them, so that checks.md can say it.

export type RequirementNote =
  /** A requirement position of the draft task `card` (from 1) that the list of `count` requirements does not have. */
  | {
      readonly kind: 'position';
      readonly card: number;
      readonly position: number;
      readonly count: number;
    }
  /**
   * Code put a requirement on a task card (`added`), took it off (`removed`), or kept it because
   * none of the requirements of the card fit what it builds (`unmatched`, `kept` being the number
   * of requirements the card keeps), from the cards behind what the task builds.
   */
  | {
      readonly kind: 'added' | 'removed';
      readonly task: string;
      readonly requirement: string;
    }
  | {
      readonly kind: 'unmatched';
      readonly task: string;
      readonly requirement: string;
      readonly kept: number;
    };

/** The requirement positions the draft tasks name that are outside the list of `count` requirements. */
// RF-627
export function unknownPositions(tasks: readonly DraftTask[], count: number): RequirementNote[] {
  return tasks.flatMap((task, index) =>
    [...new Set(task.requirements)]
      .filter((position) => position < 1 || position > count)
      .map((position): RequirementNote => ({ kind: 'position', card: index + 1, position, count })),
  );
}

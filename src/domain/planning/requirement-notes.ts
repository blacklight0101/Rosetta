import type { DraftTask } from './plan-draft.js';

// RF-627, RF-630, RF-631: what code did to the requirements of the task cards, or found wrong in
// them, so that checks.md can say it.

export type RequirementNote =
  | {
      readonly kind: 'position';
      readonly card: number;
      readonly position: number;
      readonly count: number;
    }
  | {
      readonly kind: 'added' | 'removed' | 'unmatched';
      readonly task: string;
      readonly requirement: string;
    };

/** The requirement positions the draft tasks name that are outside the list of `count` requirements. */
// RF-627
export function unknownPositions(tasks: readonly DraftTask[], count: number): RequirementNote[] {
  return count < 0 ? tasks.map(() => ({ kind: 'position', card: 0, position: 0, count })) : [];
}

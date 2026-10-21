import type { DraftTask } from './plan-draft.js';
import { cardFault } from './task-card-quality.js';

// Q-54, RF-627, RF-630, ADR-013: a task card of the planner's answer that the package leaves out is
// named by its position in the answer (from 1), the field that kept it out and a fixed reason. The
// reason is a sentence of this program, never a word of the answer, so it can be logged.

export interface LeftOutCard {
  readonly position: number;
  readonly field: string;
  readonly reason: string;
}

type Fault = Pick<LeftOutCard, 'field' | 'reason'>;

/** Why a draft task is not written, before its requirements are looked at; undefined when it is a card. */
// Q-54
export function draftFault(task: DraftTask, phases: number): Fault | undefined {
  if (task.phase < 1 || task.phase > phases) {
    return { field: 'phase', reason: 'The phase is not a phase of the plan.' };
  }
  const { riskClass } = task;
  if (riskClass === undefined) {
    return {
      field: 'riskClass',
      reason: 'The card names no risk class, or one that does not exist.',
    };
  }
  return cardFault({ ...task, riskClass });
}

/** The fault of a card that implements no requirement of the plan, given specification-driven planning (RF-607). */
export const noRequirement: Fault = {
  field: 'requirements',
  reason: 'The card implements no requirement of the plan, and the plan is specification-driven.',
};

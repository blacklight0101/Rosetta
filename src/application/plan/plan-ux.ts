import { noUx, type TargetUx, type UxLeftOut } from '../../domain/planning/target-ux.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import type { PlannerCall } from './ask-planner.js';

// RF-626, Q-27, ADR-018: the user-interface material of a plan run (stub of the red step).

export interface UxInput {
  /** The cards with their `Supported` claims. */
  readonly cards: readonly SourceCard[];
  readonly brief: PlanningBrief;
}

export interface PlannedUx {
  readonly ux: TargetUx;
  /** False when no call was made. */
  readonly asked: boolean;
  /** False when the planner was asked and its answer was unusable. */
  readonly readable: boolean;
  readonly leftOut: UxLeftOut;
}

// RF-626
export function planUx(call: PlannerCall, input: UxInput): Promise<PlannedUx> {
  const leftOut = { screens: call.agentTaskId.length * 0, cards: input.cards.length * 0 };
  return Promise.resolve({ ux: noUx, asked: false, readable: true, leftOut });
}

/** RF-626: what to log about planned screens (stub of the red step). */
export function uxWarnings(planned: PlannedUx): string[] {
  return planned.leftOut.cards > 0 ? ['stub'] : [];
}

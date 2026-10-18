import type { SourceCard } from '../../domain/planning/plan-sources.js';
import type { PlanningBrief } from '../../domain/planning/planning-brief.js';
import { assembleUx } from '../../domain/planning/target-ux-assembly.js';
import {
  noUx,
  screenCardsOf,
  type TargetUx,
  type UxLeftOut,
} from '../../domain/planning/target-ux.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { parseUxAnswer } from './ux-answer.js';
import { uxMessage } from './ux-message.js';

// RF-626, Q-27, ADR-018: the user-interface material of a plan run. When the supported cards hold a
// `SCRN` card, the planner is asked once more, through the same guarded provider, which legacy
// screens stay, merge or drop and for the short brief a designer needs; its answer is checked
// against those cards (the domain), so a screen names only a verified card, and the wireframes are
// drawn by code from the cards, never from the answer. Without a `SCRN` card there is nothing to
// plan and no call is made. An answer that is unusable is not a failure of the run (like an
// unreadable PRD): every screen is dropped with a reason, and the caller logs it.

export interface UxInput {
  /** The cards with their `Supported` claims. */
  readonly cards: readonly SourceCard[];
  readonly brief: PlanningBrief;
}

export interface PlannedUx {
  readonly ux: TargetUx;
  /** False when no call was made. */
  readonly asked: boolean;
  /** False when the planner was asked and its answer could not be read. */
  readonly readable: boolean;
  readonly leftOut: UxLeftOut;
}

const nothingLeftOut: UxLeftOut = { screens: 0, cards: 0 };

// RF-626
export async function planUx(call: PlannerCall, input: UxInput): Promise<PlannedUx> {
  const screenCards = screenCardsOf(input.cards);
  if (screenCards.length === 0) {
    return { ux: noUx, asked: false, readable: true, leftOut: nothingLeftOut };
  }
  const message = uxMessage({ screenCards, brief: input.brief }, call.tags);
  const draft = parseUxAnswer(await askPlannerWith(call, message));
  const assembly = assembleUx(draft, screenCards);
  return { ux: assembly.ux, asked: true, readable: draft !== undefined, leftOut: assembly.leftOut };
}

/** RF-626: what to log about planned screens: an unreadable answer, and what the checks refused. */
export function uxWarnings(planned: PlannedUx): string[] {
  if (!planned.asked) return [];
  const { screens, cards } = planned.leftOut;
  const unusable = planned.readable
    ? []
    : ['The planner answer for the screens could not be read; every legacy screen is dropped.'];
  const refused =
    screens + cards === 0
      ? []
      : [
          `The planner screens had items the checks refused; ${String(screens)} screen(s) without a verified SCRN card and ${String(cards)} card id(s) that are no verified screen or were placed twice were left out.`,
        ];
  return [...unusable, ...refused];
}

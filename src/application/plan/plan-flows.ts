import { assembleFlows } from '../../domain/planning/target-flows-assembly.js';
import type { DraftComponent } from '../../domain/planning/plan-draft.js';
import type { SourceCard } from '../../domain/planning/plan-sources.js';
import {
  flowCardsOf,
  noFlows,
  type FlowsLeftOut,
  type TargetFlows,
} from '../../domain/planning/target-flows.js';
import { askPlannerWith, type PlannerCall } from './ask-planner.js';
import { parseFlowsAnswer } from './flows-answer.js';
import { flowsMessage } from './flows-message.js';

// RF-625, Q-27, ADR-018: the target flows of a plan run. When the supported cards hold a `FLOW`
// card and the target architecture has a component, the planner is asked once more, through the
// same guarded provider, which journeys are in scope and in which component each step lives; its
// answer is checked against those cards and components (the domain), so a flow names only a
// verified journey and a component the architecture has. Without a `FLOW` card or a component
// there is nothing to map and no call is made. An answer that is unusable is not a failure of the
// run (like an unreadable PRD): every journey is listed as out of scope, and the caller logs it.

export interface FlowsInput {
  /** The cards with their `Supported` claims. */
  readonly cards: readonly SourceCard[];
  /** The components of the target architecture, as the checked plan names them. */
  readonly components: readonly DraftComponent[];
}

/** The flows, and whether the planner's answer was readable. */
export interface PlannedFlows {
  readonly flows: TargetFlows;
  readonly readable: boolean;
  readonly leftOut: FlowsLeftOut;
}

// RF-625
export async function planFlows(call: PlannerCall, input: FlowsInput): Promise<PlannedFlows> {
  const flowCards = flowCardsOf(input.cards);
  const noLeftOut = { flows: 0, steps: 0 };
  if (flowCards.length === 0) return { flows: noFlows, readable: true, leftOut: noLeftOut };
  const names = input.components.map((component) => component.name);
  if (names.length === 0) {
    const assembly = assembleFlows(undefined, flowCards, {
      components: names,
      allCards: input.cards,
    });
    return { flows: assembly.flows, readable: true, leftOut: noLeftOut };
  }
  const output = await askPlannerWith(call, flowsMessage({ ...input, flowCards }, call.tags));
  const draft = parseFlowsAnswer(output);
  const assembly = assembleFlows(draft, flowCards, { components: names, allCards: input.cards });
  return { flows: assembly.flows, readable: draft !== undefined, leftOut: assembly.leftOut };
}

/** RF-625: what to log about planned flows: an unreadable answer, and what the checks refused. */
export function flowsWarnings(planned: PlannedFlows): string[] {
  const { readable, leftOut } = planned;
  const unusable = readable
    ? []
    : ['The planner answer for the target flows could not be read; every journey is out of scope.'];
  const refused =
    leftOut.flows + leftOut.steps === 0
      ? []
      : [
          `The planner flows had items the checks refused; ${String(leftOut.flows)} journey(s) without a verified FLOW card and ${String(leftOut.steps)} step(s) without a supported claim or a component of the architecture were left out.`,
        ];
  return [...unusable, ...refused];
}

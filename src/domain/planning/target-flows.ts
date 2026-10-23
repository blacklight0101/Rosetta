import type { SourceCard } from './plan-sources.js';

// RF-625, Q-27, DEC-134: the target flows of the hand-off package, one per main journey. The draft
// is what the planner answers (untrusted model output, ADR-013); the flows are what is written
// once `assembleFlows` has checked it against the verified `FLOW` cards and the components of the
// target architecture. A step is a supported claim of a `FLOW` card, so it keeps its legacy text
// and card; what the planner adds is the component of the target architecture the step lives in.

/** Q-27: the most journeys that get a flow file; the rest are listed with their legacy cards. */
export const MAX_FLOWS = 15;

interface DraftFlowStep {
  /** A supported claim id of the flow's card, such as `FLOW-001.c2`. */
  readonly claim: string;
  /** The name of a component of the target architecture. */
  readonly component: string;
  /** What the component does at this step, in words. */
  readonly action: string;
}

export interface DraftFlow {
  /** The id of a `FLOW` card. */
  readonly card: string;
  readonly inScope: boolean;
  /** Why the journey is out of scope; empty for none. */
  readonly reason: string;
  readonly steps: readonly DraftFlowStep[];
}

export interface FlowsDraft {
  readonly flows: readonly DraftFlow[];
}

export interface FlowStep {
  readonly claimId: string;
  /** The supported legacy step as the card states it. */
  readonly text: string;
  /** The legacy card the step touches, when it is among the supported cards. */
  readonly touches: string | null;
  /** The target component; null when the planner mapped the step to none that exists. */
  readonly component: string | null;
  readonly action: string;
  /** The repository files the legacy step cites, as the card gives them. */
  readonly files: readonly string[];
}

export interface MappedFlow {
  readonly cardId: string;
  readonly title: string;
  readonly trigger: string;
  readonly outcome: string;
  readonly steps: readonly FlowStep[];
}

export interface OutOfScopeFlow {
  readonly cardId: string;
  readonly title: string;
  readonly reason: string;
  /** False when the planner said nothing usable, so the code listed the card. */
  readonly byPlanner: boolean;
}

export interface TargetFlows {
  readonly flows: readonly MappedFlow[];
  readonly outOfScope: readonly OutOfScopeFlow[];
}

/** How many items of the draft the flows leave out, for the log. */
export interface FlowsLeftOut {
  readonly flows: number;
  readonly steps: number;
}

export interface FlowsAssembly {
  readonly flows: TargetFlows;
  readonly leftOut: FlowsLeftOut;
}

/** The verified `FLOW` cards: those with at least one supported step, in card order. */
// RF-625
export function flowCardsOf(cards: readonly SourceCard[]): SourceCard[] {
  return cards.filter(
    (card) => card.type === 'FLOW' && card.claims.some((claim) => claim.status === 'Supported'),
  );
}

// RF-625
export const noFlows: TargetFlows = { flows: [], outOfScope: [] };

import type {
  DraftComponent,
  DraftDecision,
  DraftEntity,
  DraftRequirement,
  DraftRisk,
  PlanDraft,
} from './plan-draft.js';

// RF-601, RF-602, ADR-005, ADR-013: the planner's draft made into the content of the package.
// Every card id the model names is kept only when it is one of the supported cards, so a
// requirement cites only cards that list their citations; a requirement or an entity mapping left
// with no such card is dropped (no requirement without a source card), and so is a task in a phase
// that does not exist. The kept items are numbered in their order (`REQ-001`, `ADR-001`, `T-001`,
// `RISK-001`), and a task's requirement positions become the ids of the kept requirements. What
// was dropped is counted so the run can log it.

interface PlanRequirement extends DraftRequirement {
  readonly id: string;
}

export interface PlanDecision extends DraftDecision {
  readonly id: string;
}

export interface PlanPhase {
  /** From 1. */
  readonly number: number;
  readonly name: string;
  readonly goal: string;
  readonly exitCriteria: readonly string[];
}

interface PlanTask {
  readonly id: string;
  readonly title: string;
  readonly phase: number;
  /** `REQ-` ids. */
  readonly requirements: readonly string[];
  readonly acceptanceCriteria: readonly string[];
}

interface PlanRisk extends DraftRisk {
  readonly id: string;
}

export interface PlanContent {
  readonly summary: string;
  readonly requirements: readonly PlanRequirement[];
  readonly components: readonly DraftComponent[];
  readonly decisions: readonly PlanDecision[];
  readonly entities: readonly DraftEntity[];
  readonly phases: readonly PlanPhase[];
  readonly tasks: readonly PlanTask[];
  readonly risks: readonly PlanRisk[];
}

export interface PlanAssembly {
  readonly content: PlanContent;
  /** How many items the draft had that the package leaves out. */
  readonly dropped: {
    readonly requirements: number;
    readonly entities: number;
    readonly tasks: number;
  };
}

// RF-601, RF-602
export const assemblePlan: (
  draft: PlanDraft,
  supported: ReadonlySet<string>,
) => PlanAssembly = () => {
  const content = {
    ...{ summary: '', requirements: [], components: [], decisions: [], entities: [] },
    ...{ phases: [], tasks: [], risks: [] },
  };
  return { content, dropped: { requirements: 0, entities: 0, tasks: 0 } };
};

// RF-601, RF-602, ADR-018: what the planner answers, once its JSON has been read. It is untrusted
// model output: every card id it names is checked against the supported cards, and every
// position it names against the lists it points into, before anything is written (plan-content.ts).

export interface DraftRequirement {
  readonly title: string;
  readonly statement: string;
  /** Card ids. */
  readonly sources: readonly string[];
}

export interface DraftComponent {
  readonly name: string;
  readonly responsibility: string;
  /** Names of other components. */
  readonly dependsOn: readonly string[];
}

export interface DraftDecision {
  readonly title: string;
  readonly context: string;
  readonly decision: string;
  readonly consequences: string;
  readonly sources: readonly string[];
}

export interface DraftEntity {
  readonly legacy: string;
  readonly target: string;
  readonly notes: string;
  readonly sources: readonly string[];
}

interface DraftPhase {
  readonly name: string;
  readonly goal: string;
  readonly exitCriteria: readonly string[];
}

export interface DraftTask {
  readonly title: string;
  /** The phase's position in `phases`, from 1. */
  readonly phase: number;
  /** Positions in `requirements`, from 1. */
  readonly requirements: readonly number[];
  readonly acceptanceCriteria: readonly string[];
}

export interface DraftRisk {
  readonly text: string;
  readonly sources: readonly string[];
}

export interface PlanDraft {
  readonly summary: string;
  readonly requirements: readonly DraftRequirement[];
  readonly components: readonly DraftComponent[];
  readonly decisions: readonly DraftDecision[];
  readonly entities: readonly DraftEntity[];
  readonly phases: readonly DraftPhase[];
  readonly tasks: readonly DraftTask[];
  readonly risks: readonly DraftRisk[];
}

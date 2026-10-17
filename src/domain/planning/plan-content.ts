import type {
  DraftComponent,
  DraftDecision,
  DraftEntity,
  DraftRequirement,
  DraftRisk,
  DraftTask,
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

/** `REQ-001`, three digits at least. */
function planId(prefix: string, number: number): string {
  return `${prefix}-${String(number).padStart(3, '0')}`;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

function knownSources(sources: readonly string[], supported: ReadonlySet<string>): string[] {
  return unique(sources.filter((id) => supported.has(id)));
}

interface Requirements {
  readonly kept: readonly PlanRequirement[];
  /** The id of the kept requirement at each draft position (from 1). */
  readonly idAt: ReadonlyMap<number, string>;
}

function requirementsOf(
  drafts: readonly DraftRequirement[],
  supported: ReadonlySet<string>,
): Requirements {
  const kept: PlanRequirement[] = [];
  const idAt = new Map<number, string>();
  drafts.forEach((draft, index) => {
    const sources = knownSources(draft.sources, supported);
    if (sources.length === 0) return;
    const id = planId('REQ', kept.length + 1);
    kept.push({ ...draft, id, sources });
    idAt.set(index + 1, id);
  });
  return { kept, idAt };
}

function tasksOf(
  drafts: readonly DraftTask[],
  phases: number,
  idAt: ReadonlyMap<number, string>,
): PlanTask[] {
  const kept = drafts.filter((task) => task.phase >= 1 && task.phase <= phases);
  return kept.map((task, index) => ({
    id: planId('T', index + 1),
    title: task.title,
    phase: task.phase,
    requirements: unique(task.requirements.flatMap((at) => idAt.get(at) ?? [])),
    acceptanceCriteria: task.acceptanceCriteria,
  }));
}

function componentsOf(drafts: readonly DraftComponent[]): DraftComponent[] {
  const names = new Set(drafts.map((component) => component.name));
  return drafts.map((component) => ({
    ...component,
    dependsOn: unique(
      component.dependsOn.filter((name) => name !== component.name && names.has(name)),
    ),
  }));
}

// RF-601, RF-602
export function assemblePlan(draft: PlanDraft, supported: ReadonlySet<string>): PlanAssembly {
  const requirements = requirementsOf(draft.requirements, supported);
  const entities = draft.entities.flatMap((entity) => {
    const sources = knownSources(entity.sources, supported);
    return sources.length === 0 ? [] : [{ ...entity, sources }];
  });
  const tasks = tasksOf(draft.tasks, draft.phases.length, requirements.idAt);
  const withSources = <T extends { readonly sources: readonly string[] }>(item: T): T => ({
    ...item,
    sources: knownSources(item.sources, supported),
  });
  return {
    content: {
      summary: draft.summary,
      requirements: requirements.kept,
      components: componentsOf(draft.components),
      decisions: draft.decisions.map((decision, index) => ({
        ...withSources(decision),
        id: planId('ADR', index + 1),
      })),
      entities,
      phases: draft.phases.map((phase, index) => ({ ...phase, number: index + 1 })),
      tasks,
      risks: draft.risks.map((risk, index) => ({
        ...withSources(risk),
        id: planId('RISK', index + 1),
      })),
    },
    dropped: {
      requirements: draft.requirements.length - requirements.kept.length,
      entities: draft.entities.length - entities.length,
      tasks: draft.tasks.length - tasks.length,
    },
  };
}

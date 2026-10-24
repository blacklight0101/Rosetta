import {
  allocateIdentifiers,
  dependenciesOf,
  listedFiles,
  type AllocatedIdentifier,
} from './parallel-cards.js';
import type {
  DraftComponent,
  DraftDecision,
  DraftEntity,
  DraftRequirement,
  DraftRisk,
  DraftTask,
  PlanDraft,
  UnreadableItem,
} from './plan-draft.js';
import { unknownPositions, type RequirementNote } from './requirement-notes.js';
import type { ClaimJudgement } from './claim-judgement.js';
import { draftFault, leftOutOf, noRequirement, type LeftOutCard } from './left-out-card.js';
import type { GuardKind, RiskClass } from './task-card-quality.js';
import { assembleTechnical, type TechnicalContent } from './technical-content.js';

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
  /** The planner proposes; a choice the owner made in the planning brief is accepted. */
  readonly status: 'Proposed' | 'Accepted';
  /** The options considered, one line each; the planner's decisions list none. */
  readonly options: readonly string[];
}

export interface PlanPhase {
  /** From 1. */
  readonly number: number;
  readonly name: string;
  readonly goal: string;
  readonly exitCriteria: readonly string[];
}

export interface PlanTask {
  readonly id: string;
  readonly title: string;
  readonly phase: number;
  /** `REQ-` ids. */
  readonly requirements: readonly string[];
  readonly acceptanceCriteria: readonly string[];
  /** What must hold when the card is done (RF-630). */
  readonly invariant: string;
  readonly riskClass: RiskClass;
  readonly adds: readonly GuardKind[];
  /** Hostile or edge inputs a reviewer will try; empty for a card with no guard and no risk. */
  readonly probes: readonly string[];
  /** The files and folders the card expects to change (RF-634). */
  readonly files: readonly string[];
  /** The shared identifiers the plan allocated to this card, and no other card (RF-634). */
  readonly identifiers: readonly AllocatedIdentifier[];
  /** `T-` ids of the cards this one waits for: declared, or added because the files overlap. */
  readonly dependsOn: readonly string[];
  /** RF-627: the ids of the package items (features, tables, operations, flows, screens) it builds. */
  readonly builds: readonly string[];
  /** P5-41: criteria (position, from 1) the planner says contradict a claim the card keeps. */
  readonly contradicts?: readonly Contradiction[];
}

export interface Contradiction {
  readonly criterion: number;
  readonly claim: string;
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
  /** The content of the technical requirements document (RF-622). */
  readonly technical: TechnicalContent;
  /** RF-627: what code changed in the requirements of the task cards, or found wrong in them. */
  readonly requirementNotes?: readonly RequirementNote[];
  /** P5-41: the planner's judgements of claims (changed by a decision or an answer, likely defects). */
  readonly judgements?: readonly ClaimJudgement[];
}

export interface PlanAssembly {
  readonly content: PlanContent;
  /** Q-54: the task cards of the draft that the package leaves out, by position and field. */
  readonly leftOut: readonly LeftOutCard[];
  /** P3-126: the items of the other lists that could not be read, by list, position and field. */
  readonly unreadable: readonly UnreadableItem[];
  /** How many items the draft had that the package leaves out. */
  readonly dropped: {
    readonly requirements: number;
    readonly entities: number;
    readonly tasks: number;
    readonly technical: number;
  };
}

/** `REQ-001`, three digits at least. */
export function planId(prefix: string, number: number): string {
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

interface KeptTask {
  readonly position: number;
  readonly task: DraftTask;
  readonly riskClass: RiskClass;
  readonly requirements: string[];
  readonly files: string[];
}

/** The draft tasks that are cards of the plan, and by position and field the ones that are not. */
function keptTasks(
  drafts: readonly DraftTask[],
  phases: number,
  idAt: ReadonlyMap<number, string>,
  specified: boolean,
): { readonly kept: KeptTask[]; readonly leftOut: LeftOutCard[] } {
  const kept: KeptTask[] = [];
  const leftOut: LeftOutCard[] = [];
  drafts.forEach((task, index) => {
    const position = index + 1;
    const { riskClass } = task;
    const fault = draftFault(task, phases);
    const requirements = unique(task.requirements.flatMap((at) => idAt.get(at) ?? []));
    const missing = specified && requirements.length === 0 ? noRequirement : undefined;
    if (fault !== undefined || riskClass === undefined || missing !== undefined) {
      const left = fault ?? missing;
      if (left !== undefined) leftOut.push({ position, ...left });
      return;
    }
    kept.push({ position, task, riskClass, requirements, files: listedFiles(task.files) });
  });
  return { kept, leftOut };
}

function tasksOf(
  draft: PlanDraft,
  idAt: ReadonlyMap<number, string>,
  specified: boolean,
): { readonly tasks: PlanTask[]; readonly leftOut: LeftOutCard[] } {
  const { kept, leftOut } = keptTasks(draft.tasks, draft.phases.length, idAt, specified);
  const identifiers = allocateIdentifiers(kept.map((each) => each.task.needs));
  const at = new Map(kept.map((each, index) => [each.position, index]));
  const dependencies = dependenciesOf(
    kept.map(({ task, files }) => ({
      ...{ phase: task.phase, files },
      declared: task.dependsOn.flatMap((position) => at.get(position) ?? []),
    })),
  );
  const tasks = kept.map(({ task, riskClass, requirements, files }, index) => {
    const { title, phase, acceptanceCriteria, invariant, adds, probes } = task;
    return {
      ...{ id: planId('T', index + 1), title, phase, requirements, acceptanceCriteria },
      ...{ invariant, riskClass, adds, probes, files },
      identifiers: identifiers[index] ?? [],
      dependsOn: (dependencies[index] ?? []).map((on) => planId('T', on + 1)),
      builds: [],
    };
  });
  return { tasks, leftOut };
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

/** The entity mappings that cite a supported card, with only the supported ones kept. */
function entitiesOf(drafts: readonly DraftEntity[], supported: ReadonlySet<string>): DraftEntity[] {
  return drafts.flatMap((entity) => {
    const sources = knownSources(entity.sources, supported);
    return sources.length === 0 ? [] : [{ ...entity, sources }];
  });
}

export interface AssemblyOptions {
  /** RF-607: given SDD, a task that implements no requirement is not written. */
  readonly specificationDriven?: boolean;
}

// RF-601, RF-602, RF-607
export function assemblePlan(
  draft: PlanDraft,
  supported: ReadonlySet<string>,
  options: AssemblyOptions = {},
): PlanAssembly {
  const requirements = requirementsOf(draft.requirements, supported);
  const entities = entitiesOf(draft.entities, supported);
  const specified = options.specificationDriven === true;
  const { tasks, leftOut } = tasksOf(draft, requirements.idAt, specified);
  const notes = unknownPositions(draft.tasks, draft.requirements.length);
  const withSources = <T extends { readonly sources: readonly string[] }>(item: T): T => ({
    ...item,
    sources: knownSources(item.sources, supported),
  });
  const technical = assembleTechnical(
    draft.technical,
    supported,
    draft.decisions.map((_, index) => planId('ADR', index + 1)),
  );
  return {
    leftOut: leftOutOf(draft, leftOut),
    unreadable: draft.unreadableItems ?? [],
    content: {
      summary: draft.summary,
      requirements: requirements.kept,
      components: componentsOf(draft.components),
      decisions: draft.decisions.map((decision, index) => ({
        ...withSources(decision),
        ...{ id: planId('ADR', index + 1), status: 'Proposed' as const, options: [] },
      })),
      entities,
      phases: draft.phases.map((phase, index) => ({ ...phase, number: index + 1 })),
      tasks,
      risks: draft.risks.map((risk, index) => ({
        ...withSources(risk),
        id: planId('RISK', index + 1),
      })),
      technical: technical.content,
      ...(notes.length === 0 ? {} : { requirementNotes: notes }),
    },
    dropped: {
      requirements: draft.requirements.length - requirements.kept.length,
      entities: draft.entities.length - entities.length,
      tasks: draft.tasks.length - tasks.length,
      technical: technical.dropped,
    },
  };
}

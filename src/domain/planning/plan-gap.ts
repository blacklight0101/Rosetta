import { dependenciesOf, listedFiles, type OrderedCard } from './parallel-cards.js';
import { planId, type PlanContent, type PlanTask } from './plan-content.js';
import type { CoverageItem } from './plan-coverage.js';
import type { DraftTask } from './plan-draft.js';
import { draftFault } from './left-out-card.js';
import type { RiskClass } from './task-card-quality.js';

// Q-45, RF-627, RF-630, ADR-013, ADR-018: the task cards the planner wrote for the items no card
// builds, made into cards of the plan. The answer is untrusted: a draft is kept only when it is a
// card an agent can build without guessing (RF-630), sits in a phase that exists, implements a
// requirement when the plan is specification-driven (RF-607) and builds at least one item that
// really is a gap. What it builds is cut to the gaps (an id that is no gap, covered or invented,
// builds nothing) and listed in the order of the gaps. The kept cards take the ids after the last
// card of the plan, in the order of the answer; what they wait for is worked out like the plan's
// own cards (RF-634) over the whole plan. The cards that were there are not changed.

/** A task card the planner wrote for the gaps: a draft task without needs, and the ids it builds. */
export interface GapDraft extends Omit<DraftTask, 'needs'> {
  readonly builds: readonly string[];
}

interface KeptDraft {
  /** The draft's position in the answer, from 1. */
  readonly position: number;
  readonly draft: GapDraft;
  readonly riskClass: RiskClass;
  readonly requirements: readonly string[];
  readonly builds: readonly string[];
  readonly files: readonly string[];
}

/** A card of the answer the plan does not take: where, why, and the ids it named. */
export interface GapLeftOut {
  readonly position: number;
  readonly field: string;
  readonly reason: string;
  readonly builds: readonly string[];
}

export interface GapOptions {
  /** The position in the answer of each draft, from 1; the index plus one when not given. */
  readonly positions?: readonly number[];
  /** RF-607: given SDD, a card that implements no requirement is not written. */
  readonly specificationDriven?: boolean;
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/** The reason of each field that keeps a card out, as a phrase that follows `the field "x"`. */
const phrases: Readonly<Record<string, string>> = {
  phase: 'names a phase that the plan does not have',
  riskClass: 'names no risk class, or one that does not exist',
  invariant: 'states no invariant',
  acceptanceCriteria: 'holds a Done-when item that is not a Given, When, Then scenario',
  probes: 'lists no review probes although the card adds a guard or sits at a risk',
  builds: 'names no item that is still built by no task card',
  requirements: 'names no requirement of the plan, and the plan is specification-driven',
};

function leftOut(position: number, field: string, builds: readonly string[]): GapLeftOut {
  return { position, field, reason: phrases[field] ?? 'is not valid', builds };
}

interface Kept {
  readonly kept: KeptDraft[];
  readonly leftOut: GapLeftOut[];
}

/** The field that keeps a draft out of the plan, if any. */
function faultOf(
  content: PlanContent,
  draft: GapDraft,
  builds: readonly string[],
  noRequirement: boolean,
): string | undefined {
  const fault = draftFault(draft, content.phases.length)?.field;
  if (fault !== undefined) return fault;
  if (builds.length === 0) return 'builds';
  return noRequirement ? 'requirements' : undefined;
}

function keptDrafts(
  content: PlanContent,
  drafts: readonly GapDraft[],
  uncovered: readonly CoverageItem[],
  options: GapOptions,
): Kept {
  const result: Kept = { kept: [], leftOut: [] };
  drafts.forEach((draft, index) => {
    const position = options.positions?.[index] ?? index + 1;
    const { riskClass } = draft;
    const named = new Set(draft.builds);
    const builds = uncovered.filter((each) => named.has(each.id)).map((each) => each.id);
    const requirements = unique(
      draft.requirements.flatMap((at) => content.requirements[at - 1]?.id ?? []),
    );
    const missing = options.specificationDriven === true && requirements.length === 0;
    const field = faultOf(content, draft, builds, missing);
    if (field !== undefined || riskClass === undefined) {
      result.leftOut.push(leftOut(position, field ?? 'riskClass', draft.builds));
      return;
    }
    const files = listedFiles(draft.files);
    result.kept.push({ ...{ position, draft, riskClass }, requirements, builds, files });
  });
  return result;
}

/** What each card waits for, over the plan's cards and the new ones, as indexes into both. */
function dependenciesOver(existing: readonly PlanTask[], kept: readonly KeptDraft[]): number[][] {
  const old: OrderedCard[] = existing.map((task) => ({
    ...{ phase: task.phase, files: task.files },
    declared: task.dependsOn.flatMap((id) => {
      const at = existing.findIndex((each) => each.id === id);
      return at < 0 ? [] : [at];
    }),
  }));
  const at = new Map(kept.map((each, index) => [each.position, existing.length + index]));
  const added: OrderedCard[] = kept.map(({ draft, files }) => ({
    ...{ phase: draft.phase, files },
    declared: draft.dependsOn.flatMap((position) => at.get(position) ?? []),
  }));
  return dependenciesOf([...old, ...added]);
}

/**
 * The plan with the task cards of the answer that are cards and build a gap, numbered after the
 * last card; the plan as it was when there is none.
 */
// Q-45, RF-627, RF-630
export function addGapTasks(
  content: PlanContent,
  drafts: readonly GapDraft[],
  uncovered: readonly CoverageItem[],
  options: GapOptions = {},
): { readonly content: PlanContent; readonly leftOut: readonly GapLeftOut[] } {
  const { kept, leftOut } = keptDrafts(content, drafts, uncovered, options);
  if (kept.length === 0) return { content, leftOut };
  const first = content.tasks.length;
  const ids = [
    ...content.tasks.map((task) => task.id),
    ...kept.map((_, at) => planId('T', first + at + 1)),
  ];
  const dependencies = dependenciesOver(content.tasks, kept);
  const added = kept.map(({ draft, riskClass, requirements, builds, files }, at): PlanTask => {
    const { title, phase, acceptanceCriteria, invariant, adds, probes } = draft;
    return {
      ...{ id: ids[first + at] ?? planId('T', first + at + 1), title, phase, requirements },
      ...{ acceptanceCriteria, invariant, riskClass, adds, probes, files, builds },
      identifiers: [],
      dependsOn: (dependencies[first + at] ?? []).flatMap((on) => ids[on] ?? []),
    };
  });
  return { content: { ...content, tasks: [...content.tasks, ...added] }, leftOut };
}

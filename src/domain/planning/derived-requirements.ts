import { gapRequirementNotes, gapRequirements } from './gap-requirements.js';
import type { LeftOutCard } from './left-out-card.js';
import { planId, type PlanContent, type PlanTask } from './plan-content.js';
import type { CoverageDocuments } from './plan-coverage.js';
import type { RequirementNote } from './requirement-notes.js';
import { sourcesOfItems } from './requirement-alignment.js';

// P8-02, RF-607, RF-627, ADR-018: under SDD a package card that named no requirement of the plan
// is kept until its cards are linked to the items they build, and then takes its requirements from
// what it builds, the way a gap card does (P7-14): every requirement that cites a source card behind
// one of its items (the alignment of the links, requirement-alignment.ts, already put them on it).
// A card whose items have source cards that no requirement cites is kept without a requirement and
// each item is noted for checks.md. Only a card that builds nothing with a source card, so nothing to
// derive, is left out, by its position in the plan answer; the other cards are numbered again and
// keep waiting for what the left-out card waited for.

/** The reason checks.md gives for a card left out with nothing to derive a requirement from. */
export const nothingToDerive: Pick<LeftOutCard, 'field' | 'reason'> = {
  field: 'requirements',
  reason:
    'The card implements no requirement of the plan and builds nothing a requirement could be taken from, and the plan is specification-driven.',
};

export interface SettledRequirements {
  /** The plan with no card waiting to derive its requirements. */
  readonly content: PlanContent;
  /** The cards left out, by position in the plan answer. */
  readonly leftOut: readonly LeftOutCard[];
}

function withoutMark(task: PlanTask): PlanTask {
  const { derives, ...rest } = task;
  return derives === undefined ? task : rest;
}

/** What each card waits for, with a card that is gone replaced by what it waited for. */
function dependenciesWithout(
  tasks: readonly PlanTask[],
  gone: ReadonlySet<string>,
): Map<string, string[]> {
  const of = new Map(tasks.map((task) => [task.id, task.dependsOn]));
  const resolve = (id: string, seen: Set<string>): string[] => {
    if (!gone.has(id)) return [id];
    if (seen.has(id)) return [];
    seen.add(id);
    return (of.get(id) ?? []).flatMap((on) => resolve(on, seen));
  };
  return new Map(
    tasks.map((task) => [
      task.id,
      [...new Set(task.dependsOn.flatMap((on) => resolve(on, new Set())))],
    ]),
  );
}

function renamedNote(
  note: RequirementNote,
  renamed: ReadonlyMap<string, string>,
): RequirementNote[] {
  if (!('task' in note)) return [note];
  const task = renamed.get(note.task);
  return task === undefined ? [] : [{ ...note, task }];
}

/** The plan without the given cards, the others numbered again in their order. */
// RF-607
export function withoutTasks(content: PlanContent, gone: ReadonlySet<string>): PlanContent {
  if (gone.size === 0) return content;
  const waits = dependenciesWithout(content.tasks, gone);
  const kept = content.tasks.filter((task) => !gone.has(task.id));
  const renamed = new Map(kept.map((task, index) => [task.id, planId('T', index + 1)]));
  const tasks = kept.map((task) => ({
    ...task,
    id: renamed.get(task.id) ?? task.id,
    dependsOn: (waits.get(task.id) ?? []).flatMap((on) => renamed.get(on) ?? []),
  }));
  const notes = (content.requirementNotes ?? []).flatMap((note) => renamedNote(note, renamed));
  const { requirementNotes, ...rest } = content;
  if (requirementNotes !== undefined && notes.length > 0) {
    return { ...rest, tasks, requirementNotes: notes };
  }
  return { ...rest, tasks };
}

/** The plan once every card waiting to derive its requirements has them, or is left out. */
// P8-02, RF-607
export function settleDerivedRequirements(
  content: PlanContent,
  documents: CoverageDocuments,
): SettledRequirements {
  if (!content.tasks.some((task) => task.derives !== undefined)) return { content, leftOut: [] };
  const itemSources = sourcesOfItems(documents);
  const gone = new Set<string>();
  const leftOut: LeftOutCard[] = [];
  const notes: RequirementNote[] = [];
  const tasks = content.tasks.map((task) => {
    const { derives } = task;
    if (derives === undefined || task.requirements.length > 0) return withoutMark(task);
    const found = gapRequirements(content, [], task.builds, {
      specificationDriven: true,
      itemSources,
    });
    if (found === undefined) {
      gone.add(task.id);
      leftOut.push({ position: derives, ...nothingToDerive });
      return withoutMark(task);
    }
    notes.push(...gapRequirementNotes(task.id, found));
    return { ...withoutMark(task), requirements: [...found.requirements] };
  });
  const requirementNotes = [...(content.requirementNotes ?? []), ...notes];
  const marked = {
    ...content,
    tasks,
    ...(requirementNotes.length === 0 ? {} : { requirementNotes }),
  };
  return { content: withoutTasks(marked, gone), leftOut };
}

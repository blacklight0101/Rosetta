import { planId, type PlanContent, type PlanTask } from './plan-content.js';
import type { CoverageDocuments } from './plan-coverage.js';
import type { RequirementNote } from './requirement-notes.js';

// RF-627, RF-630, RF-631: a task card lists the requirements whose source cards are behind what it
// builds. The planner counts its requirements by position and sometimes miscounts (one too high
// for every screen card, in the evaluation of 2026-10-21), while the coverage links name the items
// by id, which code checks. So once the cards are linked, a card that builds an item gets every
// requirement that cites a source card of that item, and loses the ones that cite none of the
// source cards of what it builds but cite one behind an item another card builds. A requirement
// that no other card builds an item behind (it cites only a rule or a question, or an item nobody
// builds) has no other card to go to, so it is never taken off (DEC-160). A card that builds nothing, and an item with no source card,
// change nothing; the last requirement of a card is never taken off. Every change is a note.

type Sources = ReadonlyMap<string, ReadonlySet<string>>;

/** The source cards behind each item id, the first item of an id winning like the coverage items do. */
function sourcesOfItems(documents: CoverageDocuments): Sources {
  const { prd, dataModel, flows, apiContract, ux } = documents;
  const operations = apiContract.kind === 'openapi' ? apiContract.operations : [];
  const entries: [string, readonly string[]][] = [
    ...prd.features.map((each, at): [string, readonly string[]] => [
      `feature:${planId('F', at + 1)}`,
      each.sources,
    ]),
    ...dataModel.tables.map((each): [string, readonly string[]] => [
      `table:${each.name}`,
      each.sources,
    ]),
    ...operations.map((each): [string, readonly string[]] => [
      `operation:${each.operationId}`,
      each.serves,
    ]),
    ...flows.flows.map((each): [string, readonly string[]] => [
      `flow:${each.cardId}`,
      [each.cardId],
    ]),
    ...ux.screens.map((each): [string, readonly string[]] => [`screen:${each.id}`, each.cards]),
  ];
  const sources = new Map<string, Set<string>>();
  for (const [id, cards] of entries) if (!sources.has(id)) sources.set(id, new Set(cards));
  return sources;
}

interface Aligned {
  readonly task: PlanTask;
  readonly notes: readonly RequirementNote[];
}

/** The source cards behind what the given task cards build. */
function cardsBehind(tasks: readonly PlanTask[], sources: Sources): Set<string> {
  return new Set(
    tasks.flatMap((each) => each.builds.flatMap((id) => [...(sources.get(id) ?? [])])),
  );
}

function alignTask(task: PlanTask, plan: PlanContent, sources: Sources): Aligned {
  const behind = cardsBehind([task], sources);
  if (behind.size === 0) return { task, notes: [] };
  const elsewhere = cardsBehind(
    plan.tasks.filter((each) => each.id !== task.id),
    sources,
  );
  const wanted = plan.requirements
    .filter((each) => each.sources.some((card) => behind.has(card)))
    .map((each) => each.id);
  // Listed by the card, and no other card builds an item behind it: it has nowhere else to go.
  const stranded = plan.requirements
    .filter((each) => task.requirements.includes(each.id))
    .filter((each) => !each.sources.some((card) => elsewhere.has(card)))
    .map((each) => each.id);
  const kept = plan.requirements
    .map((each) => each.id)
    .filter((id) => wanted.includes(id) || stranded.includes(id));
  const removed = task.requirements.filter((id) => !kept.includes(id));
  const note = (kind: 'added' | 'removed', requirement: string): RequirementNote => ({
    ...{ kind, task: task.id, requirement },
  });
  if (wanted.length === 0) {
    const unmatched = (requirement: string): RequirementNote => ({
      ...{ kind: 'unmatched', task: task.id, requirement, kept: task.requirements.length },
    });
    return { task, notes: removed.map(unmatched) };
  }
  const added = wanted.filter((id) => !task.requirements.includes(id));
  return {
    task: { ...task, requirements: kept },
    notes: [...added.map((id) => note('added', id)), ...removed.map((id) => note('removed', id))],
  };
}

/** The plan with the requirements of each task card that builds an item made to agree with it. */
// RF-627
export function alignRequirements(content: PlanContent, documents: CoverageDocuments): PlanContent {
  const sources = sourcesOfItems(documents);
  const aligned = content.tasks.map((task) => alignTask(task, content, sources));
  const notes = aligned.flatMap((each) => each.notes);
  if (notes.length === 0) return content;
  return {
    ...content,
    tasks: aligned.map((each) => each.task),
    requirementNotes: [...(content.requirementNotes ?? []), ...notes],
  };
}

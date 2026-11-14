import { z } from 'zod';
import { assemblePlan, type PlanAssembly } from '../../../domain/planning/plan-content.js';
import { coverageOf, requirementItems } from '../../../domain/planning/plan-coverage.js';
import { methodPrinciples } from '../../../domain/planning/task-method.js';
import { parsePlanAnswer } from '../../plan/plan-answer.js';
import type { TargetOutcome } from '../lab-target.js';

// RF-1406, RF-604, P8-02, P10-07: the lab's check of a plan repair answer. It is assembled as a run
// assembles the plan after its repair round (`plan-assembly.ts`): the case's cards are the supported
// cards, and the plan is specification-driven when the brief names the principle `sdd`, as the run
// reads the brief (`build-plan.ts`). Not usable: `NoRequirements` (none is kept), `Shrunk` (no phase,
// no task card, a card of the case other than an `OQ` named in no `sources` list, fewer distinct
// requirements than the feature and rule cards they cite, which is a merge, or fewer distinct
// requirements or task cards than the problem lines' highest position, the floor of the earlier
// answer) and `LeftOut` (the assembly drops or cannot read an item); usable: `Open` (a requirement no
// task card lists, which a gap round of the run asks for, `coverageOf`, P9-06) and `Fixed`. The
// follow-up `gap round` and the counts the check used are given apart from the label (RF-1403). The
// first answer is not in the case, so the run's choice of the better of the two is not replayed.

interface PlanRepairCase {
  readonly cards: readonly { readonly id: string; readonly type: string }[];
  readonly owner: Readonly<Record<string, unknown>>;
  readonly problems?: readonly { readonly list: string; readonly position?: number | undefined }[];
}

/** The card kinds that each show a behaviour of their own: a feature and a business rule. */
const behaviourKinds: ReadonlySet<string> = new Set(['FEAT', 'BR']);

const briefShape = z.object({
  planningBrief: z.object({
    principles: z.array(z.union([z.string(), z.object({ id: z.string() })])),
  }),
});

/** Whether the case's brief names the principle `sdd`, the run's test of a specification-driven plan. */
function specificationDriven(owner: PlanRepairCase['owner']): boolean {
  const brief = briefShape.safeParse(owner);
  if (!brief.success) return false;
  const ids = brief.data.planningBrief.principles.map((each) =>
    typeof each === 'string' ? each : each.id,
  );
  return ids.includes(methodPrinciples.sdd);
}

/** Every card id named in a `sources` list anywhere in the kept plan. */
function citedIds(value: unknown, into = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((each) => citedIds(each, into));
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      if (key === 'sources' && Array.isArray(item)) {
        item.forEach((id) => (typeof id === 'string' ? into.add(id) : undefined));
      } else citedIds(item, into);
    }
  }
  return into;
}

/** What the assembly dropped or could not read: content a run writes the package without. */
function lostCount(assembly: PlanAssembly): number {
  const { dropped } = assembly;
  return [
    ...[assembly.leftOut.length, assembly.unreadable.length, assembly.unsourced.length],
    ...[assembly.orphaned.length, dropped.requirements, dropped.entities, dropped.tasks],
    dropped.technical,
  ].reduce((sum, count) => sum + count, 0);
}

/** A text with case and spacing aside, so that a copy counts once. */
function plain(text: string): string {
  return text.toLowerCase().replace(/s+/gu, ' ').trim();
}

/** The highest position of a list that the case's problem lines name: what the earlier answer held. */
function floorOf(input: PlanRepairCase, list: string): number {
  const positions = (input.problems ?? []).filter((each) => each.list === list);
  return Math.max(0, ...positions.map((each) => each.position ?? 0));
}

/** RF-1403, RF-1406: the counts the check reads, recorded in the case result for an audit. */
function countsOf(assembly: PlanAssembly, input: PlanRepairCase, uncovered: number) {
  const { requirements, phases, tasks } = assembly.content;
  const cited = citedIds(assembly.content);
  const fromRequirements = citedIds(requirements);
  const ofCase = input.cards.filter((card) => cited.has(card.id));
  const behaviour = input.cards.filter(
    (card) => behaviourKinds.has(card.type) && fromRequirements.has(card.id),
  );
  return {
    ...{ requirements: requirements.length },
    'distinct requirements': new Set(requirements.map((each) => plain(each.statement))).size,
    'behaviour cards': behaviour.length,
    ...{ phases: phases.length, tasks: tasks.length },
    'distinct tasks': new Set(tasks.map((each) => plain(each.title))).size,
    'cited cards': ofCase.length,
    'uncovered requirements': uncovered,
    'requirement floor': floorOf(input, 'requirements'),
    'task floor': floorOf(input, 'tasks'),
  };
}

type PlanCounts = ReturnType<typeof countsOf>;

/** RF-1406: a merge (fewer requirements than the behaviours they cite) or fewer items than before. */
function mergedOrFewer(counts: PlanCounts): boolean {
  const distinct = counts['distinct requirements'];
  return (
    distinct < counts['behaviour cards'] ||
    distinct < counts['requirement floor'] ||
    counts['distinct tasks'] < counts['task floor']
  );
}

/** The label of a plan that kept requirements: `Shrunk`, `LeftOut`, `Open` or `Fixed`. */
function labelOf(assembly: PlanAssembly, input: PlanRepairCase, counts: PlanCounts): string {
  // RF-1406: a card of the case that no sources list names is a finding the package leaves out.
  const cited = citedIds(assembly.content);
  const uncited = input.cards.some((card) => card.type !== 'OQ' && !cited.has(card.id));
  if (counts.phases === 0 || counts.tasks === 0 || uncited) return 'Shrunk';
  if (mergedOrFewer(counts)) return 'Shrunk';
  if (lostCount(assembly) > 0) return 'LeftOut';
  return counts['uncovered requirements'] > 0 ? 'Open' : 'Fixed';
}

/** RF-1406: the plan repair answer as the run would keep it, with the gap round it would ask. */
// RF-1406, RF-604, RF-627, RF-1403
export function planRepairOutcome(text: string, input: PlanRepairCase): TargetOutcome {
  const draft = parsePlanAnswer(text);
  if (draft === undefined) return { usable: false, detail: 'Unusable' };
  const supported = new Set(input.cards.map((card) => card.id));
  const assembly = assemblePlan(draft, supported, {
    specificationDriven: specificationDriven(input.owner),
  });
  const { content } = assembly;
  if (content.requirements.length === 0) return { usable: false, detail: 'NoRequirements' };
  // P9-06: a requirement no kept task card lists is an item a gap round of the run asks for.
  const open = coverageOf(requirementItems(content.requirements), content.tasks).uncovered;
  const counts = countsOf(assembly, input, open.length);
  const detail = labelOf(assembly, input, counts);
  const usable = detail === 'Open' || detail === 'Fixed';
  return { usable, detail, followUps: { 'gap round': open.length > 0 }, counts };
}

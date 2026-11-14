import { z } from 'zod';
import { assemblePlan } from '../../../domain/planning/plan-content.js';
import { methodPrinciples } from '../../../domain/planning/task-method.js';
import { parsePlanAnswer } from '../../plan/plan-answer.js';
import type { TargetOutcome } from '../lab-target.js';

// RF-1406, RF-604, P8-02, P10-07: the lab's check of a plan repair answer. It is assembled as a run
// assembles the plan after its repair round (`plan-assembly.ts`): the case's cards are the supported
// cards, and the plan is specification-driven when the brief names the principle `sdd`, as the run
// reads the brief (`build-plan.ts`). `NoRequirements`: none is kept (not usable); `LeftOut`: the
// package of a run would lose a requirement, a task card or an item, and the run logs it; `Fixed`:
// nothing is lost. The first answer is not in the case, so the run's choice of the better of the two
// is not replayed.

interface PlanRepairCase {
  readonly cards: readonly { readonly id: string }[];
  readonly owner: Readonly<Record<string, unknown>>;
}

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

/** RF-1406: the plan repair answer as the run would keep it: `Fixed`, `LeftOut` or `NoRequirements`. */
// RF-1406, RF-604
export function planRepairOutcome(text: string, input: PlanRepairCase): TargetOutcome {
  const draft = parsePlanAnswer(text);
  if (draft === undefined) return { usable: false, detail: 'Unusable' };
  const supported = new Set(input.cards.map((card) => card.id));
  const assembly = assemblePlan(draft, supported, {
    specificationDriven: specificationDriven(input.owner),
  });
  if (assembly.content.requirements.length === 0) {
    return { usable: false, detail: 'NoRequirements' };
  }
  const { dropped } = assembly;
  const lost = [
    ...[assembly.leftOut.length, assembly.unreadable.length, assembly.unsourced.length],
    ...[assembly.orphaned.length, dropped.requirements, dropped.entities, dropped.tasks],
    dropped.technical,
  ];
  return { usable: true, detail: lost.some((count) => count > 0) ? 'LeftOut' : 'Fixed' };
}

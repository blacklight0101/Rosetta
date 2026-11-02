import type { ModuleReason } from '../../domain/planning/module-coverage.js';
import type { CoverageItem } from '../../domain/planning/plan-coverage.js';
import { MAX_MODULES, type SourceModules } from '../../domain/planning/source-modules.js';
import type { GapProblem } from './gap-answer.js';

// P8-06, RF-601, EV-32: why a module of the source, or its deployment material, has no task card
// once the gap rounds are over. Every reason is a sentence of Rosetta's, from what the plan run did:
// the plan had no phase to put a card in, the call was refused, a card of the answer that named the
// module was left out (by its position and field, never with text of the answer), the answers wrote
// no card for it, or the module was over the cap of modules sent to the planner.

export interface ModuleRounds {
  /** False when no gap call was made because the plan has no phase. */
  readonly asked: boolean;
  /** True when a gap call was refused or failed. */
  readonly refused: boolean;
  /** Every card the gap rounds left out, in the order of the rounds. */
  readonly problems: readonly GapProblem[];
}

function reasonOf(item: CoverageItem, rounds: ModuleRounds): string {
  if (!rounds.asked) return 'The plan has no phase, so no task card was asked for it.';
  const named = rounds.problems.find((problem) => problem.builds.includes(item.id));
  if (named !== undefined) {
    return `The card at position ${String(named.position)} of a gap answer named it and was left out: the field "${named.field}" ${named.reason}.`;
  }
  if (rounds.refused) {
    return 'The call that asks for the task cards of what no card builds was refused or failed; the run log says why.';
  }
  return 'The planner wrote no task card for it when it was asked for the items no card builds.';
}

/** The reason of each module and of the deployment material that no card touches, in item order. */
// P8-06, RF-601
export function moduleReasons(
  untouched: readonly CoverageItem[],
  rounds: ModuleRounds,
  modules: SourceModules | undefined,
): ModuleReason[] {
  const over = (modules?.overCap ?? []).map((each) => ({
    id: `module:${each.path}`,
    reason: `The source has more than ${String(MAX_MODULES)} modules and the planner is sent the largest; this one was not sent, so no task card was asked for it.`,
  }));
  return [...untouched.map((item) => ({ id: item.id, reason: reasonOf(item, rounds) })), ...over];
}

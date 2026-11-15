import type { HandoffPackage } from '../../application/plan/handoff-package.js';
import type { BehaviourContext, BuiltScope } from '../../domain/planning/behaviours-to-keep.js';
import { keepOrFixRows, type KeepOrFixRow } from '../../domain/planning/keep-or-fix.js';
import { planId } from '../../domain/planning/plan-content.js';
import { untracedFeatureOwners } from '../../domain/planning/untraced-features.js';

// RF-631, P5-41: what the writers of the task cards, risks.md, open-questions.md and checks.md share
// about the behaviour of the legacy system: the items a card builds traced to the cards they come
// from, the planner's judgements, and the keep-or-fix rows made from them. Computed once per package.

/** The cards each built item traces to: a feature to its cards, a flow to its card, a screen to its cards. */
function scopeOf(handoff: HandoffPackage): BuiltScope {
  const features = handoff.prd.features.map((feature, index): [string, readonly string[]] => [
    `feature:${planId('F', index + 1)}`,
    feature.sources,
  ]);
  const flows = handoff.flows.flows.map((flow): [string, readonly string[]] => [
    `flow:${flow.cardId}`,
    [flow.cardId],
  ]);
  const screens = handoff.ux.screens.map((screen): [string, readonly string[]] => [
    `screen:${screen.id}`,
    screen.cards,
  ]);
  return new Map([...features, ...flows, ...screens]);
}

interface Shared {
  readonly context: BehaviourContext;
  readonly rows: readonly KeepOrFixRow[];
}

const shared = new WeakMap<HandoffPackage, Shared>();

/** The context the behaviours of every card are sorted with, and the keep-or-fix rows. */
export function keepOrFixOf(handoff: HandoffPackage): Shared {
  const known = shared.get(handoff);
  if (known !== undefined) return known;
  const { judgements = [], tasks, requirements } = handoff.content;
  const scope = scopeOf(handoff);
  // P10-14: one task keeps each FEAT card no feature traces to.
  const owners = untracedFeatureOwners(tasks, requirements, scope);
  const context: BehaviourContext = {
    ...{ tables: handoff.dataModel.tables, scope, owners, judgements },
  };
  const rows = keepOrFixRows(judgements, {
    ...{ tasks, requirements, sources: handoff.sources, tables: handoff.dataModel.tables },
    ...{ scope, owners },
  });
  const result = { context, rows };
  shared.set(handoff, result);
  return result;
}

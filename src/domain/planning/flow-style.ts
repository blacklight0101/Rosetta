import type { ArchitectureStyleId } from './catalogue.js';
import type { DraftComponent } from './plan-draft.js';
import { brokenPair, roleIn, type BrokenRuleKind } from './style-rules.js';
import type { MappedFlow } from './target-flows.js';

// RF-608, RF-625, P5-40: the rule of the chosen style, checked over the steps of the target flows
// and not only over the dependencies between components. Two steps in a row that sit in different
// components are a call from the first to the second; if their roles break the rule of the style
// (a page that goes straight to data access in a layered style), the flow is listed. A step on the
// way back to a component the flow already went through is a return, not a call, so it is not judged. A step with no component,
// or a component with no role of the style, is not judged either (style-rules.ts lists those).

/** A call between two steps of one flow that breaks the rule of the style. */
export interface FlowBreak {
  readonly flow: string;
  readonly from: string;
  readonly to: string;
  readonly rule: BrokenRuleKind;
}

/** The calls of the flows that break the style, each once per flow, in the order of the flows. */
// RF-608
export function checkFlowStyle(
  style: ArchitectureStyleId,
  components: readonly DraftComponent[],
  flows: readonly MappedFlow[],
): FlowBreak[] {
  const roles = new Map<string, string>();
  for (const { name, role } of components) {
    const known = roleIn(style, role);
    if (known !== undefined && !roles.has(name)) roles.set(name, known);
  }
  const found = new Map<string, FlowBreak>();
  for (const flow of flows) {
    for (const call of callsOf(flow)) {
      const rule = callBreak(style, roles, call.from, call.to);
      if (rule === undefined) continue;
      found.set(JSON.stringify([flow.cardId, call.from, call.to]), {
        flow: flow.cardId,
        ...call,
        rule,
      });
    }
  }
  return [...found.values()];
}

/**
 * The calls of a flow: two steps in a row in different components, the second not a component the
 * flow already went through (that is a return, not a call).
 */
function callsOf(flow: MappedFlow): { from: string; to: string }[] {
  const path = new Set<string>();
  const calls: { from: string; to: string }[] = [];
  flow.steps.forEach((step, at) => {
    const from = flow.steps[at - 1]?.component ?? null;
    const to = step.component;
    if (from !== null && to !== null && from !== to && !path.has(to)) calls.push({ from, to });
    if (to !== null) path.add(to);
  });
  return calls;
}

/** The rule a call between two components breaks, when both are known and the call goes down. */
function callBreak(
  style: ArchitectureStyleId,
  roles: ReadonlyMap<string, string>,
  from: string | null,
  to: string | null,
): BrokenRuleKind | undefined {
  const fromRole = from === null ? undefined : roles.get(from);
  const toRole = to === null ? undefined : roles.get(to);
  if (fromRole === undefined || toRole === undefined) return undefined;
  const rule = brokenPair(style, fromRole, toRole);
  return rule === 'upward' ? undefined : rule;
}

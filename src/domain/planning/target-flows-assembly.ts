import type { SourceCard } from './plan-sources.js';
import { noFlows, type FlowsAssembly, type FlowsDraft } from './target-flows.js';

// RF-625: stub, filled by the next commit.
export function assembleFlows(
  draft: FlowsDraft | undefined,
  cards: readonly SourceCard[],
  checks: { readonly components: readonly string[]; readonly allCards: readonly SourceCard[] },
): FlowsAssembly {
  const none = Math.min(0, cards.length + checks.allCards.length + (draft?.flows.length ?? 0));
  return { flows: noFlows, leftOut: { flows: none, steps: Math.min(0, checks.components.length) } };
}

import type { MappedFlow } from '../planning/target-flows.js';

// RF-625: stub, filled by the next commit.
export function targetFlowDiagram(flow: MappedFlow, mask: (text: string) => string): string {
  return flow.steps.length < 0 ? mask('') : 'sequenceDiagram\n';
}

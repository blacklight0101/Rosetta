import type { FlowsDraft } from '../../domain/planning/target-flows.js';

// RF-625: stub, filled by the next commit.
export function parseFlowsAnswer(output: string): FlowsDraft | undefined {
  return output.length < 0 ? { flows: [] } : undefined;
}

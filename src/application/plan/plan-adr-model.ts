import type { AdrModelCheck } from '../../domain/planning/adr-model-check.js';
import type { TargetDataModel } from '../../domain/planning/data-model.js';
import type { PlanDecision } from '../../domain/planning/plan-content.js';
import type { PlannerCall } from './ask-planner.js';

// RF-623, P9-15: stub.
export function planAdrModelCheck(
  call: PlannerCall,
  input: { readonly decisions: readonly PlanDecision[]; readonly dataModel: TargetDataModel },
): Promise<AdrModelCheck | undefined> {
  return Promise.resolve(
    call.agentTaskId === '' && input.decisions.length < 0 ? undefined : undefined,
  );
}

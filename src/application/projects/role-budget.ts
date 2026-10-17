import type { RoleBudget } from '../../domain/budget/budget.js';
import type { AgentRole } from '../ports/llm-provider.js';
import type { ProjectSettings } from './project-settings.js';

// RF-423, RF-613: the caps the project sets for one role (`budget.roles`); none when it sets none.
// The budget guard and the plan estimate read them here, so both check the same caps.

// RF-423
export function roleBudgetOf(settings: ProjectSettings, role: AgentRole): RoleBudget {
  const caps = settings.budget.roles?.[role];
  return {
    ...(caps?.maxCostMicros === undefined ? {} : { maxCostMicros: BigInt(caps.maxCostMicros) }),
    ...(caps?.maxTokens === undefined ? {} : { maxTokens: BigInt(caps.maxTokens) }),
  };
}

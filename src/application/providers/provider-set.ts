import type { KeySource } from '../../domain/budget/price-table.js';
import type { AgentRole, LlmProvider, ProviderKind } from '../ports/llm-provider.js';

// RF-405, ADR-003: what the provider factory gives a run for one role: the guarded provider, the
// model and limits the role is set to, and whose key pays. It holds no key.

export interface RoleProvider {
  /** Always BudgetGuard(EgressGuard(ObservedProvider(adapter))) (architecture section 7). */
  readonly provider: LlmProvider;
  /** The provider's name in the project settings. */
  readonly name: string;
  readonly kind: ProviderKind;
  readonly model: string;
  readonly maxOutputTokens: number;
  readonly temperature?: number;
  readonly keySource: KeySource;
}

/** The roles a run asked for, each with its provider. */
export type ProviderSet = ReadonlyMap<AgentRole, RoleProvider>;

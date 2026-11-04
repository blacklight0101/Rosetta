import type { KeySource } from '../../domain/budget/price-table.js';
import type { Spend } from '../../domain/budget/claim-room.js';
import type { AgentRole, LlmProvider, LlmRequest, ProviderKind } from '../ports/llm-provider.js';

// RF-405, ADR-003: what the provider factory gives a run for one role: the guarded provider, the
// model and limits the role is set to, and whose key pays. It holds no key.

export interface RoleProvider {
  /** Always BudgetGuard(EgressGuard(ObservedProvider(adapter))) (architecture section 7). */
  readonly provider: LlmProvider;
  /** The provider's name in the project settings. */
  readonly name: string;
  readonly kind: ProviderKind;
  readonly model: string;
  /** The role's output limit: the project's, else the default of its model (Q-57). */
  readonly maxOutputTokens: number;
  /** The context window the shipped model list gives the model; absent when it gives none (Q-57). */
  readonly modelContextTokens?: number | undefined;
  /** The maximum output the shipped model list gives the model; absent when it gives none (P3-100). */
  readonly modelMaxOutputTokens?: number | undefined;
  readonly temperature?: number;
  readonly keySource: KeySource;
  /** P5-20: the run token and cost caps in force for the role (the administrator's included). */
  readonly runCaps?: {
    readonly tokens: bigint;
    readonly micros: bigint;
    /** P8-03, RF-432: the run cap is the amount its owner approved, so the run pauses at it. */
    readonly approved?: boolean;
  };
  /**
   * P8-132, RF-429: the most the call can use and cost, as the budget guard reserves it (the prompt
   * estimated, plus the output limit, priced). The readers' room counts the calls in flight with it.
   */
  readonly worstCaseOf?: (request: LlmRequest) => Spend;
}

/** The roles a run asked for, each with its provider. */
export type ProviderSet = ReadonlyMap<AgentRole, RoleProvider>;

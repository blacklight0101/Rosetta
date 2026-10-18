import type { UsageCap } from '../../domain/budget/usage-cap.js';
import type { ByScenario, RoleEstimate } from './estimate-types.js';

// RF-613, ADR-007, DEC-81: what the estimate before a plan run answers: the planner's one call as
// a low, likely and high figure, the numbers behind it, and each cap the budget guard will check
// that call against, with whether each figure fits under it. Costs are bigint micro-dollars like
// the ledger (DEC-54).

/** The numbers every figure of the plan estimate rests on, stated with it. */
export interface PlanAssumptions {
  /** The planner makes one call per plan run. */
  readonly calls: 1;
  /** The system prompt and the data blocks of the supported cards and the owner's input, at the guard's four characters per token. */
  readonly promptTokens: number;
  /** The planner's `maxOutputTokens`: the high figure writes all of it, as the guard's worst case does. */
  readonly maxOutputTokens: number;
  /** The output of each scenario as a share of `maxOutputTokens`, in percent. */
  readonly outputPercent: ByScenario<number>;
  /** The cards the planner is shown: those with a `Supported` claim. */
  readonly supportedCards: number;
  /** The open questions with an answer, which the planner is also shown. */
  readonly answeredQuestions: number;
}

/**
 * One cap the call is checked against. `unit` says what `limit`, `spent` and `remaining` count:
 * micro-dollars or tokens. A new run has spent nothing against a run or role cap; the day and month
 * caps count what the ledger holds for the UTC period.
 */
export interface PlanCap {
  readonly kind: UsageCap['kind'];
  readonly unit: 'micros' | 'tokens';
  readonly limit: bigint;
  readonly spent: bigint;
  /** Never below zero. */
  readonly remaining: bigint;
  /** Whether the figure of the scenario stays at or under the cap. */
  readonly fits: ByScenario<boolean>;
}

export interface PlanEstimate {
  readonly priceTableVersion: string;
  readonly currency: 'USD';
  readonly planner: RoleEstimate;
  readonly assumptions: PlanAssumptions;
  readonly caps: readonly PlanCap[];
  /**
   * Whether the figure of the scenario fits under every cap. `high` is the budget guard's worst
   * case: when it does not fit, the guard may refuse the call and the run ends `CapReached`.
   */
  readonly withinCaps: ByScenario<boolean>;
}

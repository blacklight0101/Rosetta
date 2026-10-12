import type { KeySource } from '../../domain/budget/price-table.js';
import type { ProviderKind } from '../ports/llm-provider.js';

// RF-425, ADR-007: what the estimate before a run answers: the expected tokens and cost of each
// role as a low, likely and high figure, with the assumptions behind them. Costs are bigint
// micro-dollars like the ledger (DEC-54); tokens are whole numbers.

export const SCENARIOS = ['low', 'likely', 'high'] as const;
export type Scenario = (typeof SCENARIOS)[number];

/** One value per scenario. */
export type ByScenario<T> = Readonly<Record<Scenario, T>>;

/** The roles an understand run is estimated for: the readers and the verifier share (ADR-005). */
export const ESTIMATE_ROLES = ['reader', 'verifier'] as const;
export type EstimateRole = (typeof ESTIMATE_ROLES)[number];

export interface EstimatePoint {
  readonly inputTokens: number;
  readonly outputTokens: number;
  /** Micro-dollars; zero for a local model and for a model without a price (`priced` false). */
  readonly costMicros: bigint;
}

export interface RoleEstimate {
  readonly role: EstimateRole;
  /** The provider's name in the project settings. */
  readonly provider: string;
  readonly kind: ProviderKind;
  readonly model: string;
  /** Whose key the price is looked up for: an own key may carry a project price override (DEC-107). */
  readonly keySource: KeySource;
  /** False for a cloud model missing from the price table: tokens are shown, cost is unknown. */
  readonly priced: boolean;
  readonly points: ByScenario<EstimatePoint>;
}

/** The numbers every figure of the estimate rests on, stated with it (RF-425). */
export interface EstimateAssumptions {
  /** Reader turns per area, from the reader's `maxTurns` (DEC-117 range). */
  readonly turnsPerArea: ByScenario<number>;
  /** Output of each turn, as a share of the reader's `maxOutputTokens`. */
  readonly outputTokensPerTurn: ByScenario<number>;
  /** The share of an area's estimated tokens the reader reads, in percent. */
  readonly readSharePercent: ByScenario<number>;
  /** The verifier's tokens as a share of the readers' tokens, in percent. */
  readonly verifierSharePercent: ByScenario<number>;
  /** The system prompt and tool definitions sent with every turn. */
  readonly promptOverheadTokens: number;
  /** The most one turn sends: the context share of the reader's context window. */
  readonly contextLimitTokens: number;
  /** Reader tasks that run at once (DEC-117 range); it changes the time, not the tokens. */
  readonly parallelism: number;
  /** The cached share of the input; no cache is assumed, so the cost is never under-counted. */
  readonly cachedInputPercent: 0;
}

export interface EstimatedArea {
  readonly name: string;
  readonly estimatedTokens: number;
}

export interface RunEstimate {
  readonly priceTableVersion: string;
  readonly currency: 'USD';
  /** The areas the estimate covers, in the code map's order. */
  readonly areas: readonly EstimatedArea[];
  readonly assumptions: EstimateAssumptions;
  readonly roles: readonly RoleEstimate[];
  readonly total: ByScenario<EstimatePoint>;
}

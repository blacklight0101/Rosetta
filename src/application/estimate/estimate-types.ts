import type { KeySource } from '../../domain/budget/price-table.js';
import type { ProviderKind } from '../ports/llm-provider.js';

// RF-425, ADR-007: what the estimate before a run answers: the expected tokens and cost of each
// role as a low, likely and high figure, with the assumptions behind them. Costs are bigint
// micro-dollars like the ledger (DEC-54); tokens are whole numbers.

export type Scenario = 'low' | 'likely' | 'high';

/** One value per scenario. */
export type ByScenario<T> = Readonly<Record<Scenario, T>>;

/**
 * The roles an understand run is estimated for: the readers, the verifier share (ADR-005) and the
 * summariser that merges duplicate cards (RF-250); and the planner, the one role of a plan run (RF-613).
 */
export type EstimateRole = 'reader' | 'verifier' | 'summariser' | 'planner';

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
interface EstimateAssumptions extends ReaderAssumptions {
  /**
   * How many calls the summariser needs for the cards of the readers' answers, at most one per
   * `summariserBatchTokens` of cards (P2-35); the figures of the summariser count each.
   */
  readonly summariserBatches: ByScenario<number>;
}

/** The assumptions the reader tasks and the summariser's share rest on (known from the settings). */
export interface ReaderAssumptions {
  /** Reader turns per area, from the reader's `maxTurns` (DEC-117 range). */
  readonly turnsPerArea: ByScenario<number>;
  /** Output of each turn, as a share of the reader's `maxOutputTokens`. */
  readonly outputTokensPerTurn: ByScenario<number>;
  /** The share of an area's estimated tokens the reader reads, in percent. */
  readonly readSharePercent: ByScenario<number>;
  /** The verifier's tokens as a share of the readers' tokens, in percent. */
  readonly verifierSharePercent: ByScenario<number>;
  /** The summariser's tokens as a share of the readers' tokens, in percent (RF-250). */
  readonly summariserSharePercent: ByScenario<number>;
  /** The overview call of the summariser: the cards read once more, and this many tokens written (RF-264). */
  readonly overviewOutputTokens: ByScenario<number>;
  /** The most tokens of cards one summariser call is shown; a larger card type goes in batches (P2-35). */
  readonly summariserBatchTokens: number;
  /** The system prompt and tool definitions sent with every turn. */
  readonly promptOverheadTokens: number;
  /** Added to the prompt of every turn of an area for each of flows and screens it is marked for (Q-25). */
  readonly surfacePromptTokens: number;
  /** Added once to the output of an area for each of flows and screens it is marked for. */
  readonly surfaceOutputTokens: ByScenario<number>;
  /** The most one turn sends: the context share of the reader's context window. */
  readonly contextLimitTokens: number;
  /** Reader tasks that run at once (DEC-117 range); it changes the time, not the tokens. */
  readonly parallelism: number;
  /** The cached share of the input; no cache is assumed, so the cost is never under-counted. */
  readonly cachedInputPercent: 0;
}

interface EstimatedArea {
  readonly name: string;
  readonly estimatedTokens: number;
  /** The number of files in the area (RF-1018: the summary bar of the start page). */
  readonly files: number;
  /** True when the area holds only vendored or minified files (RF-1001): unticked by default. */
  readonly thirdParty: boolean;
}

export interface RunEstimate {
  /** RF-113: freshness of the completed scan used for this estimate. */
  readonly codeMap?: {
    readonly scannerVersion: number | null;
    readonly currentScannerVersion: number;
    readonly outdated: boolean;
  };
  readonly priceTableVersion: string;
  readonly currency: 'USD';
  /** The areas the estimate covers, in the code map's order. */
  readonly areas: readonly EstimatedArea[];
  readonly assumptions: EstimateAssumptions;
  readonly roles: readonly RoleEstimate[];
  readonly total: ByScenario<EstimatePoint>;
}

import type { KeySource } from '../../domain/budget/price-table.js';
import type { CapBreach, UsageCap, WorstCase } from '../../domain/budget/usage-cap.js';
import type { Result } from '../../domain/errors/result.js';
import type { RunStage } from '../../domain/runs/run-states.js';
import type { UsageSource } from './llm-provider.js';

// Architecture section 7, RF-428, RF-1106, DEC-107, DEC-112, data-model.md sections 3.13 and 4
// (`cost_ledger`, `cost_reservations`): one ledger row per model call of every run of every user,
// the source of every total and cap. Before a call the budget guard reserves its worst case: in one
// step the adapter sums what is spent and reserved against each cap, refuses the call when its
// worst case would pass one, and otherwise stores the reservation, so parallel calls never pass a
// cap together. After the call the reservation becomes the call's ledger row in one step. Rows are
// never updated or deleted.

/** One row of `cost_ledger` (data-model.md section 4). */
export interface LedgerEntry {
  readonly at: Date;
  readonly userId: string;
  /** Null for a provider test (RF-407). */
  readonly projectId: string | null;
  readonly runId: string | null;
  readonly agentTaskId: string | null;
  readonly stage: RunStage | 'provider-test';
  readonly role: string;
  /** The provider's name in the project settings. */
  readonly provider: string;
  readonly model: string;
  /** As in `provider-calls.jsonl`. */
  readonly callId: string;
  /** The number of the call's last attempt (RF-406). */
  readonly attempt: number;
  readonly keySource: KeySource;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
  readonly cacheWriteInputTokens: number;
  readonly usageSource: UsageSource;
  /** Fixed when the call is made, never recomputed. */
  readonly costMicros: bigint;
  readonly cacheWriteCostMicros: bigint;
  /** False for a model without a price run with the user's own key (RF-427): its cost is unknown. */
  readonly costKnown: boolean;
  readonly currency: string;
  readonly priceTableVersion: string;
}

/** One row of `cost_reservations`: the worst case of a call that has not ended yet. */
export interface Reservation {
  readonly callId: string;
  readonly userId: string;
  /** Null for a provider test (RF-407): no run cap applies to it. */
  readonly runId: string | null;
  /** The role of the call, for the role caps (RF-423). */
  readonly role: string;
  readonly keySource: KeySource;
  readonly worstCase: WorstCase;
  /** After this instant the reservation no longer counts and may be purged. */
  readonly expiresAt: Date;
}

/**
 * What names one reservation: the call of one user's run. A call id alone is not enough, because
 * it is `<runKey>#<n>` and a run key is unique only within a project, so two users' runs (or two
 * projects of one user) can share it.
 */
export type ReservationKey = Pick<Reservation, 'callId' | 'userId' | 'runId'>;

export interface ReservationRequest {
  readonly reservation: Reservation;
  /** The caps that apply to the call (DEC-107). */
  readonly caps: readonly UsageCap[];
  /** Now: picks the UTC day and month, and which reservations have expired. */
  readonly at: Date;
}

export interface CostLedger {
  /**
   * Sums the ledger and the unexpired reservations against each cap (the run, the user's UTC day
   * per key source, the server's UTC month over server keys), refuses the call with the cap it
   * would pass, and otherwise stores its reservation, all as one step.
   */
  reserve(request: ReservationRequest): Promise<Result<void, CapBreach>>;
  /** Inserts the call's ledger row and deletes its reservation (same user, run, call) in one step. */
  settle(entry: LedgerEntry): Promise<void>;
  /** Deletes the reservation of a call that was never sent. */
  release(key: ReservationKey): Promise<void>;
  /** The rows of one of the user's runs, in the order they were written (RF-426, RF-1105). */
  runEntries(userId: string, runId: string): Promise<readonly LedgerEntry[]>;
  /** Deletes the reservations that expired before `at`; answers how many. */
  purgeExpired(at: Date): Promise<number>;
}

import type { CapBreach, UsageCap } from '../../domain/budget/usage-cap.js';
import type { LedgerEntry } from './cost-ledger.js';

// RF-421, RF-422, RF-1003, ADR-007, data-model.md section 3.9: what the budget guard of a run
// reports to the run's events. The guard calls it after the ledger row of an answered call is
// written and when a cap refuses a call; a reporter that fails is logged by the guard and never
// changes what the guard decided.

/** An answered call as the ledger holds it, with the caps the guard checked it against. */
export interface RecordedCall {
  readonly entry: LedgerEntry;
  readonly caps: readonly UsageCap[];
}

export interface BudgetEvents {
  /** After the call's ledger row is written: `usage.recorded` and any warning it causes. */
  callRecorded(call: RecordedCall): Promise<void>;
  /** When a cap refused a call and the run stops: `budget.capReached`. */
  capReached(breach: CapBreach): Promise<void>;
}

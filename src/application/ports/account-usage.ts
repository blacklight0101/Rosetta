import type { EpochMs } from '../../domain/accounts/user.js';

// Architecture section 7, RF-1102: what the administration page shows next to each account, read
// from the tables other cards own: the number of projects and the spend since an instant (the
// month to date), a read-only sum over `cost_ledger` (data-model.md sections 3.13 and 4). Rows in
// different currencies are totalled per currency.

export interface CurrencyTotal {
  /** ISO 4217, for example `USD` (DEC-54). */
  readonly currency: string;
  readonly costMicros: bigint;
}

export interface UserUsage {
  readonly projects: number;
  /** Ordered by currency; empty when the user spent nothing since the instant. */
  readonly spent: readonly CurrencyTotal[];
}

export interface AccountUsage {
  /** The usage of every user that has a project or a ledger row at or after `since`. */
  byUser(since: EpochMs): Promise<ReadonlyMap<string, UserUsage>>;
  /**
   * The spend on the server's keys since the instant, per currency and ordered by currency: only
   * ledger rows whose key source is `server`, so spend on users' own keys is left out (RF-1106).
   */
  serverMonth(since: EpochMs): Promise<readonly CurrencyTotal[]>;
}

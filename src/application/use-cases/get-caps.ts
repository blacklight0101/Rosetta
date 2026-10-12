import type { ServerCaps } from '../../domain/budget/budget.js';
import { utcPeriodsOf } from '../../domain/budget/utc-periods.js';
import type { AccountUsage, CurrencyTotal } from '../ports/account-usage.js';
import type { Clock } from '../ports/clock.js';
import type { ServerSettings } from '../ports/server-settings.js';

// RF-1106, DEC-107: the administrator reads the caps on the server keys (run, user day, server
// month) from the server settings, with the server's spend so far this UTC month: the ledger rows
// paid with the server's keys only, since spend on a user's own keys does not count against the
// server cap. The route allows administrators only.

export interface CapsView {
  readonly caps: ServerCaps;
  /** Server-key spend since the start of the UTC month, per currency; empty when none. */
  readonly serverMonthToDate: readonly CurrencyTotal[];
}

export interface GetCapsDependencies {
  readonly settings: ServerSettings;
  readonly usage: AccountUsage;
  readonly clock: Clock;
}

export class GetCaps {
  private readonly deps: GetCapsDependencies;

  constructor(deps: GetCapsDependencies) {
    this.deps = deps;
  }

  // RF-1106
  async execute(): Promise<CapsView> {
    const { settings, usage, clock } = this.deps;
    const [caps, serverMonthToDate] = await Promise.all([
      settings.caps(),
      usage.serverMonth(utcPeriodsOf(clock.now()).monthStart),
    ]);
    return { caps, serverMonthToDate };
  }
}

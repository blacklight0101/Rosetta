import type { Actor } from '../../domain/accounts/actor.js';
import { totalsOf, type UsageTotals } from '../budget/cost-breakdown.js';
import type { CostTotals } from '../ports/cost-totals.js';
import type { CapsView } from './get-caps.js';

// RF-1010, RF-1106, DEC-49: what the totals pill of every signed-in header shows: the user's own
// total from the ledger (every project of theirs and their provider tests), and for the
// administrator also the server's spend this UTC month against its monthly cap.

export interface AccountTotals {
  readonly totals: UsageTotals;
  /** P5-07: every call of the user ran on a local model; false for no call at all. */
  readonly local: boolean;
  /** The administrator only: the caps and the server-key spend of this month. */
  readonly server: CapsView | undefined;
}

export interface GetAccountTotalsDependencies {
  readonly costs: CostTotals;
  /** Reads the caps and the server's month to date (the use case of the caps route). */
  readonly caps: { execute(): Promise<CapsView> };
}

export class GetAccountTotals {
  private readonly deps: GetAccountTotalsDependencies;

  constructor(deps: GetAccountTotalsDependencies) {
    this.deps = deps;
  }

  // RF-1010
  async execute(request: { readonly actor: Actor }): Promise<AccountTotals> {
    const { actor } = request;
    const [groups, server] = await Promise.all([
      this.deps.costs.userSummary(actor.userId),
      actor.role === 'admin' ? this.deps.caps.execute() : Promise.resolve(undefined),
    ]);
    const local = groups.length > 0 && groups.every((group) => group.local);
    return { totals: totalsOf(groups), local, server };
  }
}

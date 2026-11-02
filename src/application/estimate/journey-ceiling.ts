import { runStartCapsOf } from '../../domain/budget/budget.js';
import type { KeySource } from '../../domain/budget/price-table.js';
import { MAX_RUN_COST_MICROS, MAX_RUN_TOKENS } from '../projects/project-settings.js';
import type { JourneyFigure } from './estimate-types.js';

// RF-430, DEC-206, EV-84: the figure the user approves is the lower of the journey's worst case and
// the administrator ceilings that bind a run of it: the run cap and the user's day cap on server
// keys, the user's own day cap on an own key, and the run ceilings of 50,000,000 tokens and $100.
// The worst case of a journey (a Haiku eShop: $314.17 against a run cap of $4) is not a line the run
// can reach, so approving it never made the run pause (RF-432).

export interface JourneyCeilings {
  readonly tokens: number;
  readonly costMicros: bigint;
}

export interface CeilingInputs {
  readonly keySources: readonly KeySource[];
  readonly server: { readonly runMicros: bigint; readonly userDayMicros: bigint };
  readonly account: {
    readonly dailyCapMicros: bigint | null;
    readonly ownDailyCapMicros: bigint | null;
  };
}

/** The ceilings that apply when nothing is known of the server's caps: the run ceilings alone. */
export const RUN_CEILINGS: JourneyCeilings = {
  tokens: MAX_RUN_TOKENS,
  costMicros: BigInt(MAX_RUN_COST_MICROS),
};

const lower = (left: bigint, right: bigint): bigint => (left < right ? left : right);

/** The ceilings that bind a run of the journey, from the key sources of its roles (RF-1106). */
// RF-430
export function ceilingsOf(inputs: CeilingInputs): JourneyCeilings {
  const started = runStartCapsOf(inputs.keySources, {
    run: { maxCostMicros: RUN_CEILINGS.costMicros, maxTokens: BigInt(RUN_CEILINGS.tokens) },
    server: { ...inputs.server, serverMonthMicros: 0n },
    account: inputs.account,
  });
  let costMicros = started.run.maxCostMicros;
  if (started.userDay !== undefined) costMicros = lower(costMicros, started.userDay.maxCostMicros);
  const { ownDailyCapMicros } = inputs.account;
  if (started.keySource === 'user' && ownDailyCapMicros !== null) {
    costMicros = lower(costMicros, ownDailyCapMicros);
  }
  return { tokens: RUN_CEILINGS.tokens, costMicros };
}

/** The lower of the worst case and the ceilings, and whether a ceiling set it. */
// RF-430
export function approvableOf(
  worstCase: JourneyFigure,
  ceilings: JourneyCeilings,
): { readonly approvable: JourneyFigure; readonly ceilingApplied: boolean } {
  const tokens = Math.min(worstCase.tokens, ceilings.tokens);
  const costMicros = lower(worstCase.costMicros, ceilings.costMicros);
  return {
    approvable: { tokens, costMicros },
    ceilingApplied: tokens < worstCase.tokens || costMicros < worstCase.costMicros,
  };
}

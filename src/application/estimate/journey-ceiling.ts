import type { KeySource } from '../../domain/budget/price-table.js';
import type { JourneyFigure } from './estimate-types.js';

// RF-430, DEC-206: stub, filled by the feat commit.

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

/** The ceilings that bind a run of the journey. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ceilingsOf(_inputs: CeilingInputs): JourneyCeilings {
  return { tokens: Number.MAX_SAFE_INTEGER, costMicros: BigInt(Number.MAX_SAFE_INTEGER) };
}

/** The lower of the worst case and the ceilings. */
export function approvableOf(
  worstCase: JourneyFigure,
  _ceilings: JourneyCeilings,
): { readonly approvable: JourneyFigure; readonly ceilingApplied: boolean } {
  return { approvable: worstCase, ceilingApplied: _ceilings.tokens < 0 };
}

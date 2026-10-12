import { err, ok, type Result } from '../errors/result.js';

// RF-422, RF-1106, ADR-007, architecture section 5 (`UsageCap`, `Budget`): a cap is a limit on
// what is spent or reserved. A call is let through only when its worst case, added to what is
// already spent or reserved against each cap that applies, stays at or below that cap. Costs are
// micro-dollars; the run token cap counts tokens.

/**
 * `run-cost` and `run-tokens`: the run; `user-day`: one user's server-key spend in a UTC day;
 * `own-day`: one user's own-key spend in a UTC day; `server-month`: every user's server-key spend
 * in a UTC month (DEC-107).
 */
type CapKind = 'run-cost' | 'run-tokens' | 'user-day' | 'own-day' | 'server-month';

export interface UsageCap {
  readonly kind: CapKind;
  readonly limit: bigint;
}

/** What is already spent or reserved against each kind of cap. */
export type CapSpent = Readonly<Record<CapKind, bigint>>;

export const noSpend: CapSpent = {
  'run-cost': 0n,
  'run-tokens': 0n,
  'user-day': 0n,
  'own-day': 0n,
  'server-month': 0n,
};

/** The most one call can cost and use. */
export interface WorstCase {
  readonly micros: bigint;
  readonly tokens: bigint;
}

/** The cap a call would pass, with what was spent and what the call needed. */
export interface CapBreach {
  readonly kind: CapKind;
  readonly limit: bigint;
  readonly spent: bigint;
  readonly needed: bigint;
}

function neededFor(kind: CapKind, worstCase: WorstCase): bigint {
  return kind === 'run-tokens' ? worstCase.tokens : worstCase.micros;
}

/** The first cap the call's worst case would pass, or ok (RF-422, RF-1106). */
// RF-422
export function checkCaps(
  caps: readonly UsageCap[],
  spent: CapSpent,
  worstCase: WorstCase,
): Result<void, CapBreach> {
  for (const cap of caps) {
    const needed = neededFor(cap.kind, worstCase);
    const already = spent[cap.kind];
    if (already + needed > cap.limit) {
      return err({ kind: cap.kind, limit: cap.limit, spent: already, needed });
    }
  }
  return ok(undefined);
}

import { err, ok, type Result } from '../errors/result.js';

// RF-422, RF-1106, ADR-007, architecture section 5 (`UsageCap`, `Budget`): a cap is a limit on
// what is spent or reserved. A call is let through only when its worst case, added to what is
// already spent or reserved against each cap that applies, stays at or below that cap. Costs are
// micro-dollars; the run token cap counts tokens.

/**
 * `run-cost` and `run-tokens`: the run; `role-cost` and `role-tokens`: one role's calls in the run
 * (RF-423); `user-day`: one user's server-key spend in a UTC day;
 * `own-day`: one user's own-key spend in a UTC day; `server-month`: every user's server-key spend
 * in a UTC month (DEC-107).
 */
type CapKind =
  'run-cost' | 'run-tokens' | 'role-cost' | 'role-tokens' | 'user-day' | 'own-day' | 'server-month';

/**
 * Where a cap's limit comes from (RF-1106, DEC-107): the project's settings, the administrator's
 * server caps, or the account's own daily cap set by the administrator. A role cap has none, except
 * the readers' share of the run caps that keeps the rest for verifying (`reserve`, RF-429). A run
 * cap that comes from the amount the user approved is `approved` (RF-432): the run pauses there.
 */
type CapSource = 'project' | 'administrator' | 'account' | 'reserve' | 'approved';

export interface UsageCap {
  readonly kind: CapKind;
  readonly limit: bigint;
  readonly source?: CapSource;
}

/** What is already spent or reserved against each kind of cap. */
export type CapSpent = Readonly<Record<CapKind, bigint>>;

export const noSpend: CapSpent = {
  'run-cost': 0n,
  'run-tokens': 0n,
  'role-cost': 0n,
  'role-tokens': 0n,
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
  /** The role of a role cap's breach (RF-423); set by the budget guard. */
  readonly role?: string;
  /** Where the limit comes from, when the cap has a source (RF-1106). */
  readonly source?: CapSource;
}

function neededFor(kind: CapKind, worstCase: WorstCase): bigint {
  return kind === 'run-tokens' || kind === 'role-tokens' ? worstCase.tokens : worstCase.micros;
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
      const source = cap.source === undefined ? {} : { source: cap.source };
      return err({ kind: cap.kind, limit: cap.limit, spent: already, needed, ...source });
    }
  }
  return ok(undefined);
}

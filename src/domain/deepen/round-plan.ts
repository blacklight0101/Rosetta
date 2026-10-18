/* eslint-disable @typescript-eslint/no-unused-vars -- stubs until the feat commit fills them */
import type { AreaCoverage } from '../cards/area-coverage.js';
import type { Card } from '../cards/card.js';
import type { Citation } from '../cards/citation.js';
import type { FileEntry } from '../code-map/file-entry.js';

// RF-209, DEC-144, DEC-145, ADR-005: what one round of a Deepen does. It judges every claim left
// `Unverified` (or `Proposed` by a stop); it re-reads, with the verifier's reason, each `Rejected`
// claim that cites first-party code, at most once per Deepen, and never a replacement written in
// this Deepen that was rejected again; it lists a rejected claim whose every citation is in
// third-party or generated code as out of scope; and, when the coverage pass is ticked, it reads
// the first-party files of the run's areas that no task read, largest first.

/** A rejected claim a reader goes back to, with the reason the verifier gave. */
export interface RereadClaim {
  readonly claimId: string;
  /** The area of the claim's card. */
  readonly area: string;
  readonly text: string;
  readonly citations: readonly Citation[];
  readonly reason: string;
}

/** A rejected claim a Deepen does not re-read, and why. */
export interface OutOfScopeClaim {
  readonly claimId: string;
  readonly reason: string;
}

/** A first-party file of the run's areas that no task read. */
export interface GapFile {
  readonly path: string;
  readonly area: string;
  readonly tokens: number;
}

export interface RoundPlan {
  /** Claim ids to judge, in card and claim order. */
  readonly judge: readonly string[];
  readonly reread: readonly RereadClaim[];
  readonly outOfScope: readonly OutOfScopeClaim[];
  /** Largest first, then by path. */
  readonly gaps: readonly GapFile[];
}

export interface RoundInput {
  readonly cards: readonly Card[];
  /** Every coverage entry of the run so far. */
  readonly coverage: readonly AreaCoverage[];
  readonly files: readonly FileEntry[];
  /** Claims this Deepen already sent back to a reader (one retry per fact). */
  readonly reread: ReadonlySet<string>;
  /** Claims written in this Deepen; a replacement among them is never re-read in it. */
  readonly writtenHere: ReadonlySet<string>;
  /** Q-J: the coverage pass, ticked by default on the estimate. */
  readonly coveragePass: boolean;
}

/** The reason the summary gives for a rejected claim that cites only third-party or generated code. */
export const OUT_OF_SCOPE_REASON =
  'It cites only third-party or generated code, which a Deepen does not read.';

// RF-209
export function planRound(input: RoundInput): RoundPlan {
  return { judge: [], reread: [], outOfScope: [], gaps: [] };
}

/** A round with nothing to judge, re-read or read makes no progress and is not run. */
export function isEmptyRound(plan: RoundPlan): boolean {
  return false;
}

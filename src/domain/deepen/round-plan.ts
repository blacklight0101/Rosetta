import { mergedRanges, type AreaCoverage } from '../cards/area-coverage.js';
import type { Card, Claim } from '../cards/card.js';
import type { Citation } from '../cards/citation.js';
import { readsByPath } from '../cards/coverage-union.js';
import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { FileEntry } from '../code-map/file-entry.js';
import { isThirdPartyFile } from '../code-map/third-party.js';
import { citesOnlyThirdParty } from './understanding-measures.js';

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

interface Placed {
  readonly card: Card;
  readonly claim: Claim;
}

/** RF-209: a replacement written in this Deepen that was rejected again is never re-read in it. */
function mayReread(claim: Claim, input: RoundInput): boolean {
  if (input.reread.has(claim.claimId)) return false;
  return claim.replaces === undefined || !input.writtenHere.has(claim.claimId);
}

function rereadOf({ card, claim }: Placed): RereadClaim {
  const { claimId, text, citations } = claim;
  return { claimId, area: card.area, text, citations, reason: claim.verdict?.reason ?? '' };
}

/** RF-209, Q-J: the first-party files no entry read lines of, largest first, then by path. */
function gapsOf(input: RoundInput): readonly GapFile[] {
  if (!input.coveragePass) return [];
  const files = new Map(input.files.map((file) => [file.path, file]));
  const reads = readsByPath(input.coverage);
  const gaps = new Map<string, GapFile>();
  for (const entry of input.coverage) {
    for (const { path } of entry.files) {
      const file = files.get(path);
      if (file === undefined || gaps.has(path) || isThirdPartyFile(file)) continue;
      const read = mergedRanges(reads.get(path) ?? [], file.lines).length > 0;
      if (!read && file.estimatedTokens > 0) {
        gaps.set(path, { path, area: entry.area, tokens: file.estimatedTokens });
      }
    }
  }
  return [...gaps.values()].sort(
    (left, right) => right.tokens - left.tokens || byCodeUnit(left.path, right.path),
  );
}

// RF-209
export function planRound(input: RoundInput): RoundPlan {
  const placed = input.cards.flatMap((card) => card.claims.map((claim) => ({ card, claim })));
  const status = (wanted: Claim['status']) => placed.filter(({ claim }) => claim.status === wanted);
  const rejected = status('Rejected');
  const ownCode = rejected.filter(({ claim }) => !citesOnlyThirdParty(claim, input.files));
  const library = rejected.filter(({ claim }) => citesOnlyThirdParty(claim, input.files));
  return {
    judge: placed
      .filter(({ claim }) => claim.status === 'Unverified' || claim.status === 'Proposed')
      .map(({ claim }) => claim.claimId),
    reread: ownCode.filter(({ claim }) => mayReread(claim, input)).map(rereadOf),
    outOfScope: library.map(({ claim }) => ({
      claimId: claim.claimId,
      reason: OUT_OF_SCOPE_REASON,
    })),
    gaps: gapsOf(input),
  };
}

/** A round with nothing to judge, re-read or read makes no progress and is not run. */
export function isEmptyRound(plan: RoundPlan): boolean {
  return plan.judge.length === 0 && plan.reread.length === 0 && plan.gaps.length === 0;
}

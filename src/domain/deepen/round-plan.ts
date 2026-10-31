import {
  mergedRanges,
  tokensRead,
  unreadRanges,
  type AreaCoverage,
  type LineRange,
} from '../cards/area-coverage.js';
import type { Card, Claim, VerdictReasonKind } from '../cards/card.js';
import type { Citation } from '../cards/citation.js';
import { readsByPath } from '../cards/coverage-union.js';
import { filesNotReadInFull } from '../cards/read-in-full.js';
import type { Area } from '../code-map/area.js';
import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { FileEntry } from '../code-map/file-entry.js';
import { isThirdPartyFile } from '../code-map/third-party.js';
import {
  uncoveredObjects,
  type DatabaseObject,
  type ObjectCoverage,
} from '../cards/database-objects.js';
import { citesOnlyThirdParty } from './understanding-measures.js';

// RF-209, DEC-144, DEC-145, ADR-005: what one round of a Deepen does. It judges every claim left
// `Unverified` (or `Proposed` by a stop); it re-reads, with the verifier's reason, each `Rejected`
// claim that cites first-party code, at most once per Deepen, and never a replacement written in
// this Deepen that was rejected again; it lists a rejected claim whose every citation is in
// third-party or generated code as out of scope; and, when the coverage pass is ticked, it reads
// the first-party files of the run's areas that no task read, largest first. It also reads again,
// whole, each area whose every task ended without a usable card (EV-10): such an area has no
// rejected claim and, once its files were opened, no file that no task read, so nothing else would
// ever name it. An area is read again once per Deepen.

/** A rejected claim a reader goes back to, with the reason the verifier gave. */
export interface RereadClaim {
  readonly claimId: string;
  /** The area of the claim's card. */
  readonly area: string;
  readonly text: string;
  readonly citations: readonly Citation[];
  readonly reason: string;
  /** P5-35: the verifier said a meaning the claim states is defined outside the cited lines. */
  readonly reasonKind?: VerdictReasonKind;
}

/** A rejected claim a Deepen does not re-read, and why. */
export interface OutOfScopeClaim {
  readonly claimId: string;
  readonly reason: string;
}

/**
 * A first-party file of the run's areas that no task read, or that tasks read only in part (EV-04):
 * then `unreadRanges` are the lines no task read and `tokens` those lines' share of the file.
 */
export interface GapFile {
  readonly path: string;
  readonly area: string;
  readonly tokens: number;
  readonly unreadRanges?: readonly LineRange[];
}

/** An area whose every task ended without a usable card, to be read again. */
export interface FailedArea {
  readonly area: string;
  /** Why it failed, as the coverage says it: a few words with the error code. */
  readonly failure: string;
  /** The files of the area not read in full by its tasks, in the area's order. */
  readonly unread: readonly string[];
}

export interface RoundPlan {
  /** Claim ids to judge, in card and claim order. */
  readonly judge: readonly string[];
  readonly reread: readonly RereadClaim[];
  readonly outOfScope: readonly OutOfScopeClaim[];
  /** Largest first, then by path. */
  readonly gaps: readonly GapFile[];
  /** In the order the areas first appear in the coverage. */
  readonly failedAreas: readonly FailedArea[];
  /** P5-36: database objects no card states, to be read before other re-reads; absent when none. */
  readonly objects?: readonly ObjectCoverage[];
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
  /** The areas this Deepen already read again because they failed, finished or not. */
  readonly retriedAreas: ReadonlySet<string>;
  /** Q-J: the coverage pass, ticked by default on the estimate. */
  readonly coveragePass: boolean;
  /** P5-36: the database objects of the areas the run read. */
  readonly objects?: readonly DatabaseObject[];
  /** P7-02: the names of the areas the run planned; one with no coverage entry is read whole. */
  readonly plannedAreas?: readonly string[] | undefined;
  /** P7-02: the areas of the code map, to name the files of a planned area with no entry. */
  readonly areas?: readonly Pick<Area, 'name' | 'files'>[];
}

/** The reason the summary gives for a rejected claim that cites only third-party or generated code. */
export const OUT_OF_SCOPE_REASON =
  'It cites only third-party or generated code, which a Deepen does not read.';

interface Placed {
  readonly card: Card;
  readonly claim: Claim;
}

/**
 * RF-209: a replacement written in this Deepen that was rejected again is never re-read in it, and
 * a rejected claim that a Supported replacement already answers (an earlier Deepen's, Q-L) is not
 * re-read either: it would spend tokens on a fact the run already holds.
 */
function mayReread(claim: Claim, input: RoundInput, answered: ReadonlySet<string>): boolean {
  if (input.reread.has(claim.claimId) || answered.has(claim.claimId)) return false;
  return claim.replaces === undefined || !input.writtenHere.has(claim.claimId);
}

function rereadOf({ card, claim }: Placed): RereadClaim {
  const { claimId, text, citations } = claim;
  const reasonKind = claim.verdict?.reasonKind;
  const kind = reasonKind === undefined ? {} : { reasonKind };
  return {
    claimId,
    area: card.area,
    text,
    citations,
    reason: claim.verdict?.reason ?? '',
    ...kind,
  };
}

/**
 * EV-04: a tail of a partly read file is offered to the coverage pass only if it is worth a task:
 * at least this many tokens or this share of the file. A smaller tail is still listed as not read.
 */
const MIN_TAIL_TOKENS = 500;
const MIN_TAIL_SHARE = 0.1;

/** EV-04: what is left to read of a file, whole when no line was read; undefined when nothing is. */
function gapOf(file: FileEntry, area: string, reads: readonly LineRange[]): GapFile | undefined {
  const read = mergedRanges(reads, file.lines);
  const unread = unreadRanges(read, file.lines);
  if (unread.length === 0 || file.estimatedTokens <= 0) return undefined;
  const { path } = file;
  if (read.length === 0) return { path, area, tokens: file.estimatedTokens };
  const tokens = file.estimatedTokens - tokensRead(file, read);
  const share = tokens / file.estimatedTokens;
  if (tokens <= 0 || (tokens < MIN_TAIL_TOKENS && share < MIN_TAIL_SHARE)) return undefined;
  return { path, area, tokens, unreadRanges: unread };
}

/** RF-209, Q-J, EV-04: the first-party files, or parts of them, no entry read, largest first, then by path. */
function gapsOf(input: RoundInput): readonly GapFile[] {
  const gaps = new Map(coverageGapsOf(input).map((gap) => [gap.path, gap]));
  for (const gap of unstartedGapsOf(input)) if (!gaps.has(gap.path)) gaps.set(gap.path, gap);
  return sortedGaps([...gaps.values()]);
}

function coverageGapsOf(input: RoundInput): readonly GapFile[] {
  if (!input.coveragePass) return [];
  const files = new Map(input.files.map((file) => [file.path, file]));
  const reads = readsByPath(input.coverage);
  const gaps = new Map<string, GapFile>();
  for (const entry of input.coverage) {
    for (const { path } of entry.files) {
      const file = files.get(path);
      if (file === undefined || gaps.has(path) || isThirdPartyFile(file)) continue;
      const gap = gapOf(file, entry.area, reads.get(path) ?? []);
      if (gap !== undefined) gaps.set(path, gap);
    }
  }
  return [...gaps.values()];
}

function sortedGaps(gaps: readonly GapFile[]): readonly GapFile[] {
  return [...gaps].sort(
    (left, right) => right.tokens - left.tokens || byCodeUnit(left.path, right.path),
  );
}

/**
 * P7-02, DEC-194: the first-party files of an area of the run's plan that no coverage entry names:
 * no reader started it, so every file of it is unread. Whether the coverage pass is ticked or not.
 */
function unstartedGapsOf(input: RoundInput): readonly GapFile[] {
  const planned = new Set(input.plannedAreas ?? []);
  if (planned.size === 0) return [];
  const started = new Set(input.coverage.map((entry) => entry.area));
  const files = new Map(input.files.map((file) => [file.path, file]));
  return (input.areas ?? []).flatMap((area) => {
    if (!planned.has(area.name) || started.has(area.name)) return [];
    return area.files.flatMap((path) => {
      const file = files.get(path);
      if (file === undefined || isThirdPartyFile(file) || file.estimatedTokens <= 0) return [];
      return [{ path, area: area.name, tokens: file.estimatedTokens }];
    });
  });
}

/** EV-10: the areas whose every coverage entry failed and that this Deepen has not read again. */
function failedAreasOf(input: RoundInput): readonly FailedArea[] {
  const entries = new Map<string, AreaCoverage[]>();
  for (const entry of input.coverage) {
    entries.set(entry.area, [...(entries.get(entry.area) ?? []), entry]);
  }
  return [...entries].flatMap(([area, held]) => {
    const failure = held[0]?.failure;
    if (failure === undefined || held.some((entry) => entry.failure === undefined)) return [];
    if (input.retriedAreas.has(area)) return [];
    const reads = readsByPath(held);
    const paths = held.flatMap((entry) => entry.files.map((file) => file.path));
    const unread = filesNotReadInFull(
      [...new Set(paths)],
      input.files,
      (path) => reads.get(path) ?? [],
    );
    return [{ area, failure, unread }];
  });
}

// RF-209
export function planRound(input: RoundInput): RoundPlan {
  const placed = input.cards.flatMap((card) => card.claims.map((claim) => ({ card, claim })));
  const status = (wanted: Claim['status']) => placed.filter(({ claim }) => claim.status === wanted);
  const rejected = status('Rejected');
  const ownCode = rejected.filter(({ claim }) => !citesOnlyThirdParty(claim, input.files));
  const library = rejected.filter(({ claim }) => citesOnlyThirdParty(claim, input.files));
  const answered = new Set(
    status('Supported').flatMap(({ claim }) =>
      claim.replaces === undefined ? [] : [claim.replaces],
    ),
  );
  const objects = uncoveredObjects(input.objects ?? [], input.cards);
  return {
    ...(objects.length === 0 ? {} : { objects }),
    judge: placed
      .filter(({ claim }) => claim.status === 'Unverified' || claim.status === 'Proposed')
      .map(({ claim }) => claim.claimId),
    reread: ownCode.filter(({ claim }) => mayReread(claim, input, answered)).map(rereadOf),
    outOfScope: library.map(({ claim }) => ({
      claimId: claim.claimId,
      reason: OUT_OF_SCOPE_REASON,
    })),
    gaps: gapsOf(input),
    failedAreas: failedAreasOf(input),
  };
}

/** A round with nothing to judge, re-read or read makes no progress and is not run. */
export function isEmptyRound(plan: RoundPlan): boolean {
  const none = (list: readonly unknown[]): boolean => list.length === 0;
  return (
    none(plan.judge) &&
    none(plan.reread) &&
    none(plan.gaps) &&
    none(plan.failedAreas) &&
    none(plan.objects ?? [])
  );
}

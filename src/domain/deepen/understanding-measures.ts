import {
  linesIn,
  mergedRanges,
  rounded,
  tokensRead,
  unreadRanges,
  type AreaCoverage,
  type LineRange,
} from '../cards/area-coverage.js';
import type { Card, Claim } from '../cards/card.js';
import { readsByPath } from '../cards/coverage-union.js';
import { byCodeUnit } from '../code-map/code-unit-order.js';
import type { FileEntry } from '../code-map/file-entry.js';
import { isThirdPartyFile, isThirdPartyPath } from '../code-map/third-party.js';

// RF-231, RF-230, ADR-005, DEC-144, DEC-145: the honest measures of an understand run. Coverage counts
// first-party tokens only: a file the scan marks third-party (a vendored library, a minified or
// bundled script, RF-104) is shown apart and is in no percentage, and so is a claim whose every
// citation is in such a file. The Supported share is `Supported / (Supported + Rejected)`; claims
// not judged are counted on their own. "Well covered" needs at least 80% of the first-party tokens
// read and no claim left unjudged; nothing ever says complete.

/**
 * A first-party file no task read, or read only in part (EV-04). `tokens` are the tokens not read;
 * a partly read file also gives the share of the file not read and the line ranges not read.
 */
interface UnreadFile {
  readonly path: string;
  readonly tokens: number;
  readonly unreadShare?: number;
  readonly unreadRanges?: readonly LineRange[];
}

export interface UnderstandingMeasures {
  /** First-party tokens read over first-party tokens of the run's areas, 0..1, four decimals; null without any. */
  readonly firstPartyCoverage: number | null;
  readonly firstPartyTokens: number;
  readonly firstPartyReadTokens: number;
  /** Largest first; files the scan skipped (binary, too large) have no tokens and are left out. */
  readonly filesNotRead: readonly UnreadFile[];
  readonly supported: number;
  readonly rejected: number;
  /** `supported / (supported + rejected)`; null when no claim was judged. */
  readonly supportedShare: number | null;
  /** Claims left `Unverified`, or `Proposed` because a stop came before their judgement. */
  readonly notJudged: number;
  /** Rejected first-party claims that no `Supported` claim replaces (RF-209). */
  readonly rejectedUnresolved: number;
  /** `Supported` claims that replace a rejected one, listed apart (RF-231). */
  readonly supportedAfterReread: number;
  readonly thirdParty: {
    readonly files: number;
    readonly tokens: number;
    /** Claims whose every citation is in third-party code. */
    readonly claims: number;
  };
  /** RF-231, Q-K: at least 80% of the first-party tokens read and no claim left unjudged. */
  readonly wellCovered: boolean;
}

export interface MeasureInput {
  readonly cards: readonly Card[];
  /** Every coverage entry of the run; an area may have several (a Deepen reads it again). */
  readonly coverage: readonly AreaCoverage[];
  readonly files: readonly FileEntry[];
}

/** RF-231, Q-K: the first-party share of tokens read from which a run may be called well covered. */
const WELL_COVERED_SHARE = 0.8;

interface FileRead {
  readonly path: string;
  readonly thirdParty: boolean;
  readonly tokens: number;
  readonly readTokens: number;
  /** Some line of the file was read. */
  readonly read: boolean;
  /** The lines of the file no entry read; empty for a file read from its first line to its last. */
  readonly unread: readonly LineRange[];
  readonly lines: number;
}

/** Every file of the run's coverage, once, with the tokens read of it over every entry. */
function filesOf(input: Omit<MeasureInput, 'cards'>): readonly FileRead[] {
  const entries = new Map(input.files.map((file) => [file.path, file]));
  return [...readsByPath(input.coverage)].flatMap(([path, ranges]) => {
    const file = entries.get(path);
    if (file === undefined) return [];
    const merged = mergedRanges(ranges, file.lines);
    const readTokens = tokensRead(file, merged);
    const thirdParty = isThirdPartyFile(file);
    return [
      {
        path,
        thirdParty,
        tokens: file.estimatedTokens,
        readTokens,
        read: merged.length > 0,
        unread: unreadRanges(merged, file.lines),
        lines: file.lines,
      },
    ];
  });
}

/** RF-209, RF-231: a claim every citation of which is in third-party or generated code. */
export function citesOnlyThirdParty(claim: Claim, files: readonly FileEntry[]): boolean {
  return claim.citations.every((citation) => {
    const file = files.find((each) => each.path === citation.path);
    return file === undefined ? isThirdPartyPath(citation.path) : isThirdPartyFile(file);
  });
}

function sum(files: readonly FileRead[], pick: (file: FileRead) => number): number {
  return files.reduce((total, file) => total + pick(file), 0);
}

/** EV-04: a file read in part is listed with the tokens, share and lines left unread. */
function unreadFileOf(file: FileRead): UnreadFile {
  if (!file.read) return { path: file.path, tokens: file.tokens };
  return {
    path: file.path,
    tokens: file.tokens - file.readTokens,
    unreadShare: rounded(linesIn(file.unread) / file.lines, 4),
    unreadRanges: file.unread,
  };
}

function coverageMeasures(input: Omit<MeasureInput, 'cards'>) {
  const all = filesOf(input);
  const own = all.filter((file) => !file.thirdParty);
  const library = all.filter((file) => file.thirdParty);
  const firstPartyTokens = sum(own, (file) => file.tokens);
  const firstPartyReadTokens = sum(own, (file) => file.readTokens);
  const filesNotRead = own
    .filter((file) => file.unread.length > 0 && file.tokens > 0)
    .map(unreadFileOf)
    .sort((left, right) => right.tokens - left.tokens || byCodeUnit(left.path, right.path));
  return {
    firstPartyCoverage:
      firstPartyTokens === 0 ? null : rounded(firstPartyReadTokens / firstPartyTokens, 4),
    firstPartyTokens,
    firstPartyReadTokens,
    filesNotRead,
    thirdParty: { files: library.length, tokens: sum(library, (file) => file.tokens) },
  };
}

function claimMeasures(own: readonly Claim[]) {
  const count = (keep: (claim: Claim) => boolean): number => own.filter(keep).length;
  const supported = count((claim) => claim.status === 'Supported');
  const rejected = count((claim) => claim.status === 'Rejected');
  const answered = new Set(
    own.flatMap((claim) =>
      claim.status === 'Supported' && claim.replaces !== undefined ? [claim.replaces] : [],
    ),
  );
  return {
    supported,
    rejected,
    supportedShare: supported + rejected === 0 ? null : supported / (supported + rejected),
    notJudged: count((claim) => claim.status === 'Unverified' || claim.status === 'Proposed'),
    rejectedUnresolved: count(
      (claim) => claim.status === 'Rejected' && !answered.has(claim.claimId),
    ),
    supportedAfterReread: count(
      (claim) => claim.status === 'Supported' && claim.replaces !== undefined,
    ),
  };
}

// RF-231
export function understandingMeasures(input: MeasureInput): UnderstandingMeasures {
  const coverage = coverageMeasures(input);
  const claims = input.cards.flatMap((card) => card.claims);
  const own = claims.filter((claim) => !citesOnlyThirdParty(claim, input.files));
  const judged = claimMeasures(own);
  const share = coverage.firstPartyCoverage;
  return {
    ...coverage,
    ...judged,
    thirdParty: { ...coverage.thirdParty, claims: claims.length - own.length },
    wellCovered: share !== null && share >= WELL_COVERED_SHARE && judged.notJudged === 0,
  };
}

/** RF-209: the first-party files some coverage entry read lines of. */
export function readFirstPartyFiles(input: Omit<MeasureInput, 'cards'>): ReadonlySet<string> {
  const read = filesOf(input).filter((file) => !file.thirdParty && file.read);
  return new Set(read.map((file) => file.path));
}

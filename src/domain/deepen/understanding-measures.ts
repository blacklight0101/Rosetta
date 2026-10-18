/* eslint-disable @typescript-eslint/no-unused-vars -- stubs until the feat commit fills them */
import type { AreaCoverage } from '../cards/area-coverage.js';
import type { Card } from '../cards/card.js';
import type { FileEntry } from '../code-map/file-entry.js';

// RF-231, RF-230, ADR-005, DEC-144, DEC-145: the honest measures of an understand run. Coverage counts
// first-party tokens only: a file the scan marks third-party (a vendored library, a minified or
// bundled script, RF-104) is shown apart and is in no percentage, and so is a claim whose every
// citation is in such a file. The Supported share is `Supported / (Supported + Rejected)`; claims
// not judged are counted on their own. "Well covered" needs at least 80% of the first-party tokens
// read and no claim left unjudged; nothing ever says complete.

/** A first-party file no task read, with its estimated tokens. */
export interface UnreadFile {
  readonly path: string;
  readonly tokens: number;
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
export const WELL_COVERED_SHARE = 0.8;

// RF-231
export function understandingMeasures(input: MeasureInput): UnderstandingMeasures {
  return {
    firstPartyCoverage: null,
    firstPartyTokens: 0,
    firstPartyReadTokens: 0,
    filesNotRead: [],
    supported: 0,
    rejected: 0,
    supportedShare: null,
    notJudged: 0,
    rejectedUnresolved: 0,
    supportedAfterReread: 0,
    thirdParty: { files: 0, tokens: 0, claims: 0 },
    wellCovered: false,
  };
}

/** RF-209: the first-party files some coverage entry read lines of. */
export function readFirstPartyFiles(input: Omit<MeasureInput, 'cards'>): ReadonlySet<string> {
  return new Set();
}

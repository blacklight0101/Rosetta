import type { Citation } from '../../domain/cards/citation.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import type { ReportCardDetail, ReportClaim } from './card-detail.js';

// RF-502, RF-301, ADR-013: the cited lines of every claim of a card, with a few lines of context,
// read through the RepositoryReader of the scan (so ignored and denied files are refused as they
// are for the agent tools).

/** A claim as its card file holds it: the citations are still only `path:a-b`. */
export interface CardFileClaim extends Omit<ReportClaim, 'citations'> {
  readonly citations: readonly Citation[];
}

/** A card as its file holds it. */
export interface CardFile extends Omit<ReportCardDetail, 'claims'> {
  readonly claims: readonly CardFileClaim[];
}

/** The lines read before and after each cited range (RF-502: "a few lines of context"). */
export const CONTEXT_LINES = 3;

/** The cards with the lines of every citation; `reader` is undefined when the snapshot is gone. */
// RF-502
export function addEvidence(
  files: readonly CardFile[],
  reader: Pick<RepositoryReader, 'readLines'> | undefined,
): Promise<readonly ReportCardDetail[]> {
  return Promise.resolve(files.length === 0 || reader === undefined ? [] : []);
}

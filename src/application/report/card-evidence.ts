import type { Citation } from '../../domain/cards/citation.js';
import { cutLine } from '../agent/tool-text.js';
import { defaultToolLimits } from '../agent/tool-limits.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import type { ReportCardDetail, ReportClaim, ReportExcerpt } from './card-detail.js';

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
const CONTEXT_LINES = 3;

type LineReader = Pick<RepositoryReader, 'readLines'>;

const NO_SNAPSHOT: ReportExcerpt = {
  kind: 'unavailable',
  reason: 'The snapshot of the scan is not available, so the lines are not shown.',
};

async function excerptOf(reader: LineReader, citation: Citation): Promise<ReportExcerpt> {
  const span = citation.endLine - citation.startLine + 1;
  if (span > defaultToolLimits.maxReadLines) {
    return {
      kind: 'unavailable',
      reason: `The cited range has ${String(span)} lines, too many to show here; open it on GitHub.`,
    };
  }
  const read = await reader.readLines({
    path: citation.path,
    startLine: Math.max(1, citation.startLine - CONTEXT_LINES),
    endLine: citation.endLine + CONTEXT_LINES,
  });
  if (!read.ok) return { kind: 'unavailable', reason: read.error.message };
  const lines = read.value.lines.map((line) => cutLine(line, defaultToolLimits.maxLineChars));
  return { kind: 'lines', firstLine: read.value.startLine, lines };
}

/** The cards with the lines of every citation; `reader` is undefined when the snapshot is gone. */
// RF-502
export async function addEvidence(
  files: readonly CardFile[],
  reader: LineReader | undefined,
): Promise<readonly ReportCardDetail[]> {
  // One read per range, however many claims cite it.
  const excerpts = new Map<string, Promise<ReportExcerpt>>();
  const excerptFor = (citation: Citation): Promise<ReportExcerpt> => {
    if (reader === undefined) return Promise.resolve(NO_SNAPSHOT);
    const key = `${citation.path}:${String(citation.startLine)}-${String(citation.endLine)}`;
    const known = excerpts.get(key);
    if (known !== undefined) return known;
    const made = excerptOf(reader, citation);
    excerpts.set(key, made);
    return made;
  };
  const details: ReportCardDetail[] = [];
  for (const file of files) {
    const claims: ReportClaim[] = [];
    for (const claim of file.claims) {
      const citations = [];
      for (const citation of claim.citations) {
        citations.push({ ...citation, excerpt: await excerptFor(citation) });
      }
      claims.push({ ...claim, citations });
    }
    details.push({ ...file, claims });
  }
  return details;
}

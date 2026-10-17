import type { Citation } from '../../domain/cards/citation.js';
import { err, ok, type Result } from '../../domain/errors/result.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import { defaultToolLimits } from '../agent/tool-limits.js';
import { cutLine } from '../agent/tool-text.js';

// RF-301, ADR-005, ADR-006: the evidence the verifier sees for one claim: the lines of each
// citation with a small margin before and after, read through the RepositoryReader (so ignored
// and denied files are refused as for the reader's tools), and nothing else of the file. The
// lines are kept as they are, except that a line longer than the tool limit is cut. Evidence
// larger than the limits is not cut: the claim cannot be judged on part of its evidence, so it
// is left `Unverified` with the reason, and no call is made.

/** The lines read before and after each cited range (RF-301: "a small margin"). */
export const JUDGEMENT_MARGIN_LINES = 3;

export interface EvidenceLimits {
  /** The most lines, margins included, over every citation of a claim (`scan.excerptMaxLines`). */
  readonly maxLines: number;
  /** The most characters over every citation of a claim. */
  readonly maxChars: number;
}

export const defaultEvidenceLimits: EvidenceLimits = {
  maxLines: defaultToolLimits.maxReadLines,
  maxChars: defaultToolLimits.maxResultChars,
};

/** The lines of one citation as read, with their real range. */
export interface CitedExcerpt {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly lines: readonly string[];
}

/** The range read for a citation: the cited lines and the margin, never before line 1. */
function withMargin(citation: Citation): Citation {
  return {
    path: citation.path,
    startLine: Math.max(1, citation.startLine - JUDGEMENT_MARGIN_LINES),
    endLine: citation.endLine + JUDGEMENT_MARGIN_LINES,
  };
}

function lineCount(citations: readonly Citation[]): number {
  return citations.reduce((total, each) => total + each.endLine - each.startLine + 1, 0);
}

function charCount(excerpts: readonly CitedExcerpt[]): number {
  return excerpts.reduce((total, each) => total + each.lines.join('\n').length, 0);
}

function tooLarge(what: string, size: number, limit: number): string {
  return `The cited lines are too long to judge in one call (${String(size)} ${what}, at most ${String(limit)}).`;
}

/** The excerpts of a claim's citations, or why they cannot be judged (RF-301). */
// RF-301
export async function readCitedLines(
  reader: Pick<RepositoryReader, 'readLines'>,
  citations: readonly Citation[],
  limits: EvidenceLimits,
): Promise<Result<readonly CitedExcerpt[], string>> {
  const ranges = citations.map(withMargin);
  const lines = lineCount(ranges);
  if (lines > limits.maxLines) return err(tooLarge('lines', lines, limits.maxLines));
  const excerpts: CitedExcerpt[] = [];
  for (const range of ranges) {
    const read = await reader.readLines(range);
    if (!read.ok) return err(`The cited lines could not be read: ${read.error.message}`);
    const { path, startLine, endLine } = read.value;
    const cut = read.value.lines.map((line) => cutLine(line, defaultToolLimits.maxLineChars));
    excerpts.push({ path, startLine, endLine, lines: cut });
  }
  const chars = charCount(excerpts);
  if (chars > limits.maxChars) return err(tooLarge('characters', chars, limits.maxChars));
  return ok(excerpts);
}

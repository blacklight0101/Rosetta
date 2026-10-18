import type { Citation } from '../../domain/cards/citation.js';
import type { SkipReason } from '../../domain/code-map/file-entry.js';
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

/** Why the scan did not read a file of the code map, or undefined for a file it read (RF-100). */
export type SkipLookup = (path: string) => SkipReason | undefined;

/** The lines of one citation as read, with their real range. */
export interface CitedExcerpt {
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly lines: readonly string[];
  /** True for a file the scan did not read: `lines` is a note, and it is no excerpt (P2-44). */
  readonly skipped: boolean;
}

/**
 * ADR-013 (defence in depth): `1 <= start <= end`, whole numbers. The citation check refuses any
 * other range first; the margin must never turn a reversed or negative range into lines read.
 */
function isLineRange({ startLine, endLine }: Citation): boolean {
  const whole = Number.isInteger(startLine) && Number.isInteger(endLine);
  return whole && startLine >= 1 && startLine <= endLine;
}

/** The range read for a citation: the cited lines and the margin, never before line 1. */
function withMargin(citation: Citation): Citation {
  return {
    path: citation.path,
    startLine: Math.max(1, citation.startLine - JUDGEMENT_MARGIN_LINES),
    endLine: citation.endLine + JUDGEMENT_MARGIN_LINES,
  };
}

/**
 * RF-100, P2-39: a file the scan did not read (binary, too large) is never read or sent, whatever
 * the reader could do with it: the verifier gets a note, as the reader's tools say it cannot be
 * read, and the note carries no excerpt, so the egress log names nothing that was not sent (P2-44).
 */
function skippedExcerpt({ path, startLine, endLine }: Citation, reason: SkipReason): CitedExcerpt {
  return { path, startLine, endLine, lines: [`${reason}, not sent`], skipped: true };
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
  skipReason: SkipLookup,
): Promise<Result<readonly CitedExcerpt[], string>> {
  const bad = citations.find((each) => !isLineRange(each));
  if (bad !== undefined) {
    const { path, startLine, endLine } = bad;
    return err(
      `The cited range ${path}:${String(startLine)}-${String(endLine)} is not a range of lines.`,
    );
  }
  const ranges = citations.map(withMargin);
  const lines = lineCount(ranges.filter((range) => skipReason(range.path) === undefined));
  if (lines > limits.maxLines) return err(tooLarge('lines', lines, limits.maxLines));
  const excerpts: CitedExcerpt[] = [];
  for (const [index, range] of ranges.entries()) {
    const skipped = skipReason(range.path);
    const cited = citations[index];
    if (skipped !== undefined && cited !== undefined) {
      excerpts.push(skippedExcerpt(cited, skipped));
      continue;
    }
    const read = await reader.readLines(range);
    if (!read.ok) return err(`The cited lines could not be read: ${read.error.message}`);
    const { path, startLine, endLine } = read.value;
    const cut = read.value.lines.map((line) => cutLine(line, defaultToolLimits.maxLineChars));
    excerpts.push({ path, startLine, endLine, lines: cut, skipped: false });
  }
  const chars = charCount(excerpts);
  if (chars > limits.maxChars) return err(tooLarge('characters', chars, limits.maxChars));
  return ok(excerpts);
}

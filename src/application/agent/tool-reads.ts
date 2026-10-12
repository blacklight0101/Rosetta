import { err, ok } from '../../domain/errors/result.js';
import type { RepositoryReader } from '../ports/repository-reader.js';
import type { ToolAnswer } from './tool-answer.js';
import type { ToolLimits } from './tool-limits.js';
import { cutLine, linesThatFit } from './tool-text.js';

// RF-144, RF-146, RF-201: read_file and grep through the RepositoryReader, with every result cut
// to the tool limits. A read keeps the file's lines exactly as they are (only a line longer than
// the limit is cut), so line numbers and the egress guard's line-based masking stay valid.

interface LinesRequest {
  /** The code map's spelling of the path. */
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

// RF-201
export async function readLinesBounded(
  reader: RepositoryReader,
  request: LinesRequest,
  limits: ToolLimits,
): Promise<ToolAnswer> {
  const read = await reader.readLines(request);
  if (!read.ok) return err({ code: read.error.code, message: read.error.message });
  const lines = read.value.lines.map((line) => cutLine(line, limits.maxLineChars));
  const kept = lines.slice(0, Math.max(1, linesThatFit(lines, limits.maxResultChars)));
  const { path, startLine } = read.value;
  const endLine = startLine + kept.length - 1;
  return ok({ excerpts: [{ path, startLine, endLine }], text: kept.join('\n') });
}

interface GrepOptions {
  readonly limits: ToolLimits;
  /** Whether the code map lists a path; matches in other files are left out. */
  readonly isListed: (path: string) => boolean;
}

/** Room kept in a grep result for its notices. */
const noticeChars = 400;

// RF-146
export async function runGrepBounded(
  reader: RepositoryReader,
  request: { readonly pattern: string; readonly pathGlob: string | undefined },
  options: GrepOptions,
): Promise<ToolAnswer> {
  const { pattern, pathGlob } = request;
  const result = await reader.grep(pathGlob === undefined ? { pattern } : { pattern, pathGlob });
  if (!result.ok) return err({ code: result.error.code, message: result.error.message });
  const { limits, isListed } = options;
  const matches = result.value.matches.filter((match) => isListed(match.path));
  const lines = matches
    .slice(0, limits.maxGrepMatches)
    .map(
      (match) => `${match.path}:${String(match.line)}: ${cutLine(match.text, limits.maxLineChars)}`,
    );
  const count = linesThatFit(lines, Math.max(0, limits.maxResultChars - noticeChars));
  const kept = matches.slice(0, count);
  const notices: string[] = [];
  if (matches.length === 0) notices.push('No matches.');
  if (kept.length < matches.length) {
    notices.push(
      `Only the first ${String(kept.length)} matches of ${String(matches.length)} are shown; narrow the pattern or the pathGlob.`,
    );
  }
  if (result.value.notice !== undefined) notices.push(result.value.notice);
  const excerpts = kept.map((match) => ({
    path: match.path,
    startLine: match.line,
    endLine: match.line,
  }));
  return ok({ excerpts, text: [...lines.slice(0, count), ...notices].join('\n') });
}

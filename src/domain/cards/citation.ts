import { err, ok, type Result } from '../errors/result.js';
import { isRepositoryPath } from '../sources/permalink.js';

// ADR-005, conventions section 1: a citation is `path:startLine-endLine`, 1-based, inclusive.

export interface Citation {
  /** Repository-relative, forward slashes. */
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

export type CitationProblem = 'invalid-format' | 'invalid-path' | 'invalid-lines';

const textForm = /^(.+):(\d{1,9})(?:-(\d{1,9}))?$/;

// RF-202
export function createCitation(
  path: string,
  startLine: number,
  endLine: number,
): Result<Citation, CitationProblem> {
  if (!isRepositoryPath(path)) return err('invalid-path');
  const whole = Number.isInteger(startLine) && Number.isInteger(endLine);
  if (!whole || startLine < 1 || endLine < startLine) return err('invalid-lines');
  return ok({ path, startLine, endLine });
}

/** RF-207: reads `path:a` as `path:a-a`, or `path:a-b`; the path ends at the last colon, so it may hold colons itself. */
export function parseCitation(text: string): Result<Citation, CitationProblem> {
  const parts = textForm.exec(text);
  if (parts === null) return err('invalid-format');
  const [, path = '', start = '', end = start] = parts;
  return createCitation(path, Number(start), Number(end));
}

export function formatCitation(citation: Citation): string {
  return `${citation.path}:${String(citation.startLine)}-${String(citation.endLine)}`;
}

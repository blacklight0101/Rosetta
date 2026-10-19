import { err, ok, type Result } from '../errors/result.js';
import type { CommitSha } from './commit-sha.js';
import { repositoryUrl } from './github-repo-ref.js';

export interface PermalinkInput {
  readonly owner: string;
  readonly repo: string;
  readonly commitSha: CommitSha;
  /** Repository-relative path with forward slashes. */
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
}

export type PermalinkProblem = 'invalid-path' | 'invalid-lines';

function pathSegments(path: string): string[] | undefined {
  if (path === '' || path.startsWith('/') || path.includes('\\')) return undefined;
  const segments = path.split('/');
  const valid = segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
  return valid ? segments : undefined;
}

/** True for a repository-relative path with forward slashes and no `.`, `..` or empty segment. */
export function isRepositoryPath(path: string): boolean {
  return pathSegments(path) !== undefined;
}

/** True for whole line numbers from 1 with the end not before the start. */
export function isLineRange(startLine: number, endLine: number): boolean {
  return (
    Number.isInteger(startLine) &&
    Number.isInteger(endLine) &&
    startLine >= 1 &&
    endLine >= startLine
  );
}

/** `https://github.com/<owner>/<repo>/blob/<sha>/<path>#L<a>-L<b>` for a citation `path:a-b`. */
// RF-125
export function buildPermalink(input: PermalinkInput): Result<string, PermalinkProblem> {
  const segments = pathSegments(input.path);
  if (segments === undefined) return err('invalid-path');
  if (!isLineRange(input.startLine, input.endLine)) return err('invalid-lines');
  const encodedPath = segments.map((segment) => encodeURIComponent(segment)).join('/');
  const lines = `L${String(input.startLine)}-L${String(input.endLine)}`;
  return ok(`${repositoryUrl(input)}/blob/${input.commitSha.value}/${encodedPath}#${lines}`);
}

import { err, ok, type Result } from '../errors/result.js';
import type { CommitSha } from './commit-sha.js';

/** A public GitHub repository, an optional ref (branch, tag or SHA) and an optional folder in it. */
export interface GitHubRepoRef {
  readonly owner: string;
  readonly repo: string;
  readonly ref: string | undefined;
  readonly subpath: string | undefined;
}

export type GitHubUrlProblem =
  | 'not-a-url'
  | 'not-https'
  | 'not-github'
  | 'missing-repository'
  | 'invalid-name'
  | 'invalid-ref'
  | 'invalid-subpath';

const GITHUB_HOST = 'github.com';
const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const REPO = /^[A-Za-z0-9_.-]+$/;
// Characters git refuses in a ref name, plus whitespace and control characters.
const REF_FORBIDDEN = /[\s~^:?*[\\\p{Cc}]/u;

function decodeSegments(pathname: string): string[] | undefined {
  try {
    return pathname
      .split('/')
      .filter((segment) => segment !== '')
      .map((segment) => decodeURIComponent(segment));
  } catch {
    return undefined;
  }
}

// Dot segments (`.` and `..`, encoded or not) never reach these checks: the URL parser resolves them.
function isValidRef(ref: string): boolean {
  return !ref.startsWith('-') && !REF_FORBIDDEN.test(ref);
}

function isValidSubpathSegment(segment: string): boolean {
  return !/[\\\p{Cc}]/u.test(segment);
}

function parseUrl(input: string): Result<URL, GitHubUrlProblem> {
  const text = input.trim();
  if (!URL.canParse(text)) return err('not-a-url');
  const url = new URL(text);
  if (url.protocol !== 'https:') return err('not-https');
  if (
    url.hostname !== GITHUB_HOST ||
    url.port !== '' ||
    url.username !== '' ||
    url.password !== ''
  ) {
    return err('not-github');
  }
  return ok(url);
}

function parseTree(
  rest: readonly string[],
): Result<Pick<GitHubRepoRef, 'ref' | 'subpath'>, GitHubUrlProblem> {
  if (rest.length === 0) return ok({ ref: undefined, subpath: undefined });
  const [kind, ref, ...subpath] = rest;
  if (kind !== 'tree' || ref === undefined || !isValidRef(ref)) return err('invalid-ref');
  if (!subpath.every(isValidSubpathSegment)) return err('invalid-subpath');
  return ok({ ref, subpath: subpath.length === 0 ? undefined : subpath.join('/') });
}

/**
 * Parses `https://github.com/<owner>/<repo>[/tree/<ref>[/<subpath>]]`. Normalises surrounding
 * whitespace, the host's case, a trailing slash and a `.git` suffix; the query string and fragment
 * are ignored; dot segments are resolved by the URL parser, so a subpath never climbs up. Any other
 * host, scheme or shape is refused.
 */
// RF-120
export function parseGitHubUrl(input: string): Result<GitHubRepoRef, GitHubUrlProblem> {
  const url = parseUrl(input);
  if (!url.ok) return url;
  const segments = decodeSegments(url.value.pathname);
  if (segments === undefined) return err('not-a-url');
  const [owner, rawRepo, ...rest] = segments;
  if (owner === undefined || rawRepo === undefined) return err('missing-repository');
  const repo = rawRepo.endsWith('.git') ? rawRepo.slice(0, -'.git'.length) : rawRepo;
  if (!OWNER.test(owner) || !REPO.test(repo)) return err('invalid-name');
  const tree = parseTree(rest);
  return tree.ok ? ok({ owner, repo, ...tree.value }) : tree;
}

/** The canonical repository address, `https://github.com/<owner>/<repo>` (RF-126). */
export function repositoryUrl(ref: Pick<GitHubRepoRef, 'owner' | 'repo'>): string {
  return `https://${GITHUB_HOST}/${ref.owner}/${ref.repo}`;
}

/**
 * The snapshot folder name `<owner>__<repo>@<sha>` (data-model.md section 3.3). GitHub names are
 * case-insensitive, so the key is lower-cased and a cached commit is found however the URL was typed.
 */
// RF-122
export function snapshotKey(ref: Pick<GitHubRepoRef, 'owner' | 'repo'>, sha: CommitSha): string {
  return `${ref.owner.toLowerCase()}__${ref.repo.toLowerCase()}@${sha.value}`;
}

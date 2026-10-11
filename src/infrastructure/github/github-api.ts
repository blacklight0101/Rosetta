import { z } from 'zod';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { parseCommitSha, type CommitSha } from '../../domain/sources/commit-sha.js';
import type { GitHubRepoRef } from '../../domain/sources/github-repo-ref.js';
import type { GitHubHttpClient } from './github-http-client.js';

export interface RepositoryInfo {
  /** Owner and repository as GitHub spells them. */
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  /** SPDX id, or `unknown`. */
  readonly licence: string;
}

const API = 'https://api.github.com';
const JSON_ACCEPT = 'application/vnd.github+json';
const SHA_ACCEPT = 'application/vnd.github.sha';

const REPOSITORY_SCHEMA = z.object({
  name: z.string(),
  owner: z.object({ login: z.string() }),
  private: z.boolean(),
  default_branch: z.string(),
  license: z.object({ spdx_id: z.string() }).nullable().optional(),
});

function repoPath(ref: GitHubRepoRef): string {
  return `/repos/${encodeURIComponent(ref.owner)}/${encodeURIComponent(ref.repo)}`;
}

function invalidAnswer(what: string, cause?: unknown): RosettaError {
  return new RosettaError(
    ERROR_CODES.githubRequestFailed,
    `GitHub answered with an unexpected ${what}.`,
    cause === undefined ? undefined : { cause },
  );
}

/** The three GitHub REST calls Rosetta makes: repository metadata, ref resolution, tarball. */
// RF-120, RF-121
export class GitHubApi {
  private readonly client: GitHubHttpClient;
  private readonly requestTimeoutMs: number;

  constructor(client: GitHubHttpClient, requestTimeoutMs: number) {
    this.client = client;
    this.requestTimeoutMs = requestTimeoutMs;
  }

  /** Metadata of a public repository; a private one is refused like a missing one (RF-120). */
  async repository(ref: GitHubRepoRef, signal: AbortSignal): Promise<RepositoryInfo> {
    const response = await this.client.get(new URL(repoPath(ref), API), {
      accept: JSON_ACCEPT,
      signal,
      timeoutMs: this.requestTimeoutMs,
      notFound: ERROR_CODES.githubSourceUnavailable,
    });
    const parsed = REPOSITORY_SCHEMA.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) throw invalidAnswer('repository description', parsed.error);
    if (parsed.data.private) throw new RosettaError(ERROR_CODES.githubSourceUnavailable);
    const spdx = parsed.data.license?.spdx_id;
    return {
      owner: parsed.data.owner.login,
      repo: parsed.data.name,
      defaultBranch: parsed.data.default_branch,
      licence: spdx === undefined || spdx === '' || spdx === 'NOASSERTION' ? 'unknown' : spdx,
    };
  }

  /** Resolves a branch, tag or SHA to the full commit SHA (RF-121). */
  async commitSha(ref: GitHubRepoRef, refName: string, signal: AbortSignal): Promise<CommitSha> {
    const url = new URL(`${repoPath(ref)}/commits/${encodeURIComponent(refName)}`, API);
    const response = await this.client.get(url, {
      accept: SHA_ACCEPT,
      signal,
      timeoutMs: this.requestTimeoutMs,
      notFound: ERROR_CODES.githubRefNotFound,
    });
    const sha = parseCommitSha((await response.text()).trim());
    if (!sha.ok) throw invalidAnswer('commit SHA');
    return sha.value;
  }

  /** The tarball response (after the redirect to codeload.github.com), ready to stream. */
  tarball(
    ref: GitHubRepoRef,
    sha: CommitSha,
    options: { signal: AbortSignal; timeoutMs: number },
  ): Promise<Response> {
    return this.client.get(new URL(`${repoPath(ref)}/tarball/${sha.value}`, API), {
      accept: 'application/x-gzip, */*',
      signal: options.signal,
      timeoutMs: options.timeoutMs,
      notFound: ERROR_CODES.githubRefNotFound,
    });
  }
}

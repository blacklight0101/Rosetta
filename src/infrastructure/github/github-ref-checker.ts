import type { GitHubRefCheck, RefAnswer } from '../../application/ports/github-ref-check.js';
import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import type { GitHubRepoRef } from '../../domain/sources/github-repo-ref.js';
import type { GitHubApi } from './github-api.js';

// RF-010, EV-70: asks the GitHub REST API whether the ref of an address exists.
export class GitHubRefChecker implements GitHubRefCheck {
  readonly api: Pick<GitHubApi, 'repository' | 'commitSha'>;

  constructor(api: Pick<GitHubApi, 'repository' | 'commitSha'>) {
    this.api = api;
  }

  async check(ref: GitHubRepoRef, signal: AbortSignal): Promise<RefAnswer> {
    if (ref.ref === undefined) return 'found';
    try {
      // The repository first: a missing or private one is RST-1903 for the scan to report, not a ref.
      await this.api.repository(ref, signal);
      await this.api.commitSha(ref, ref.ref, signal);
      return 'found';
    } catch (error) {
      return error instanceof RosettaError && error.code === ERROR_CODES.githubRefNotFound
        ? 'missing'
        : 'unreachable';
    }
  }
}

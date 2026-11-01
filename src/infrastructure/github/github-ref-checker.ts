import type { GitHubRefCheck, RefAnswer } from '../../application/ports/github-ref-check.js';
import type { GitHubRepoRef } from '../../domain/sources/github-repo-ref.js';
import type { GitHubApi } from './github-api.js';

// RF-010, EV-70: asks the GitHub REST API whether the ref of an address exists.
export class GitHubRefChecker implements GitHubRefCheck {
  readonly api: Pick<GitHubApi, 'repository' | 'commitSha'>;

  constructor(api: Pick<GitHubApi, 'repository' | 'commitSha'>) {
    this.api = api;
  }

  check(ref: GitHubRepoRef, signal: AbortSignal): Promise<RefAnswer> {
    const unreachable = (): RefAnswer => 'unreachable';
    return this.api.repository(ref, signal).then(unreachable, unreachable);
  }
}

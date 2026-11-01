import type { GitHubRepoRef } from '../../domain/sources/github-repo-ref.js';

/** What GitHub said about the ref of an address (`missing` is RST-1901; `unreachable` is any other failure). */
export type RefAnswer = 'found' | 'missing' | 'unreachable';

// RF-010, EV-70: asks GitHub whether the branch or tag of an address exists, so Create project can
// refuse one that does not. It never throws: every failure to get an answer is `unreachable`.
export interface GitHubRefCheck {
  check(ref: GitHubRepoRef, signal: AbortSignal): Promise<RefAnswer>;
}

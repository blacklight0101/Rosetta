import type { GitHubUrlProblem } from '../../domain/sources/github-repo-ref.js';

// RF-010, RF-120: the plain reason shown next to the address field when a GitHub URL is refused.

/** Why an address is refused: a malformed one, or a branch or tag GitHub does not have (EV-70). */
export type UrlReason = GitHubUrlProblem | 'ref-not-found';

export const URL_REASONS: Readonly<Record<UrlReason, string>> = {
  'not-a-url': 'The text is not a web address.',
  'not-https': 'The address must start with https://.',
  'not-github': 'The address is not on github.com.',
  'missing-repository': 'The address needs an owner and a repository name.',
  'invalid-name': 'The owner or repository name has characters GitHub does not allow.',
  'invalid-ref': 'The branch or tag after /tree/ is not valid.',
  'invalid-subpath': 'The folder after the branch or tag is not valid.',
  'ref-not-found': 'The branch or tag after /tree/ does not exist in this repository.',
};

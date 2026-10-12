import type { GitHubUrlProblem } from '../../domain/sources/github-repo-ref.js';

// RF-010, RF-120: the plain reason shown next to the address field when a GitHub URL is refused.

export const URL_REASONS: Readonly<Record<GitHubUrlProblem, string>> = {
  'not-a-url': 'The text is not a web address.',
  'not-https': 'The address must start with https://.',
  'not-github': 'The address is not on github.com.',
  'missing-repository': 'The address needs an owner and a repository name.',
  'invalid-name': 'The owner or repository name has characters GitHub does not allow.',
  'invalid-ref': 'The branch or tag after /tree/ is not valid.',
  'invalid-subpath': 'The folder after the branch or tag is not valid.',
};

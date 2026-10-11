import { ERROR_CODES } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';

/** The only hosts a fetch may talk to or be redirected to (RF-127, ADR-013). */
const GITHUB_HOSTS: readonly string[] = ['api.github.com', 'codeload.github.com', 'github.com'];

/** Undefined when the URL is https to an allowed GitHub host; otherwise the RST-1904 error to throw. */
// RF-127
export function checkGitHubUrl(url: URL): RosettaError | undefined {
  const allowed =
    url.protocol === 'https:' &&
    GITHUB_HOSTS.includes(url.hostname) &&
    url.port === '' &&
    url.username === '' &&
    url.password === '';
  return allowed
    ? undefined
    : new RosettaError(
        ERROR_CODES.githubHostRefused,
        `Refused ${url.protocol}//${url.host}: downloads use https to GitHub hosts only.`,
      );
}

import type { Logger } from '../../application/ports/logger.js';
import { ERROR_CODES, type ErrorCode } from '../../domain/errors/codes.js';
import { RosettaError } from '../../domain/errors/rosetta-error.js';
import { checkGitHubUrl } from './github-hosts.js';

/** The shape of `fetch` this client needs; tests pass an in-process fake. */
export type FetchFunction = (url: URL, init: RequestInit) => Promise<Response>;

export interface GitHubHttpClientOptions {
  readonly fetch?: FetchFunction;
  /** The optional read-only GITHUB_TOKEN; sent only to GitHub hosts and never logged (RF-123). */
  readonly token: string | undefined;
  readonly logger: Logger;
}

export interface GitHubGetOptions {
  readonly accept: string;
  readonly signal: AbortSignal;
  readonly timeoutMs: number;
  /** The code a 404 or 422 answer becomes: RST-1903 for a repository, RST-1901 for a ref. */
  readonly notFound: ErrorCode;
}

const MAX_REDIRECTS = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const API_VERSION = '2022-11-28';
const USER_AGENT = 'rosetta';

function isRateLimited(response: Response): boolean {
  return (
    (response.status === 403 || response.status === 429) &&
    (response.headers.get('x-ratelimit-remaining') === '0' || response.headers.has('retry-after'))
  );
}

function rateLimitError(response: Response): RosettaError {
  const reset = Number(response.headers.get('x-ratelimit-reset'));
  const resetText =
    Number.isFinite(reset) && reset > 0 ? new Date(reset * 1000).toISOString() : 'later';
  return new RosettaError(
    ERROR_CODES.githubRateLimited,
    `GitHub is limiting requests until ${resetText}. Set a read-only GITHUB_TOKEN to raise the limit.`,
  );
}

/**
 * GET requests to GitHub with the controls of RF-127: https to allowed hosts only, every redirect
 * checked before it is followed, a timeout on every request, the token only on GitHub hosts.
 */
// RF-123, RF-127
export class GitHubHttpClient {
  private readonly fetchFunction: FetchFunction;
  private readonly token: string | undefined;
  private readonly logger: Logger;

  constructor(options: GitHubHttpClientOptions) {
    this.fetchFunction = options.fetch ?? ((url, init) => globalThis.fetch(url, init));
    this.token = options.token;
    this.logger = options.logger;
  }

  /** Returns the final 2xx response; every other outcome is a RosettaError in the RST-19xx range. */
  async get(url: URL, options: GitHubGetOptions): Promise<Response> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      await this.refuseIfOutsideGitHub(current);
      const response = await this.send(current, options);
      const location = response.headers.get('location');
      if (!REDIRECT_STATUSES.has(response.status) || location === null) {
        return this.checkStatus(response, options.notFound);
      }
      await response.body?.cancel();
      current = new URL(location, current);
    }
    throw new RosettaError(
      ERROR_CODES.githubRequestFailed,
      `GitHub redirected more than ${String(MAX_REDIRECTS)} times.`,
    );
  }

  private async refuseIfOutsideGitHub(url: URL): Promise<void> {
    const refusal = checkGitHubUrl(url);
    if (refusal === undefined) return;
    await this.logger.securityEvent(refusal.code, {
      message: refusal.message,
      data: { host: url.host, protocol: url.protocol },
    });
    throw refusal;
  }

  private async send(url: URL, options: GitHubGetOptions): Promise<Response> {
    const headers = new Headers({
      accept: options.accept,
      'user-agent': USER_AGENT,
      'x-github-api-version': API_VERSION,
    });
    if (this.token !== undefined) headers.set('authorization', `Bearer ${this.token}`);
    options.signal.throwIfAborted();
    const signal = AbortSignal.any([options.signal, AbortSignal.timeout(options.timeoutMs)]);
    try {
      return await this.fetchFunction(url, { method: 'GET', headers, redirect: 'manual', signal });
    } catch (error) {
      if (options.signal.aborted) throw error;
      throw new RosettaError(
        ERROR_CODES.githubRequestFailed,
        `GitHub did not answer: ${url.host}${url.pathname} failed or timed out.`,
        { cause: error },
      );
    }
  }

  private checkStatus(response: Response, notFound: ErrorCode): Response {
    if (response.ok) return response;
    if (isRateLimited(response)) throw rateLimitError(response);
    if (response.status === 404 || response.status === 422) throw new RosettaError(notFound);
    throw new RosettaError(
      ERROR_CODES.githubRequestFailed,
      `GitHub answered ${String(response.status)} to ${new URL(response.url || 'https://github.com/').host}.`,
    );
  }
}

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { FetchFunction } from '../../src/infrastructure/github/github-http-client.js';

/** A public repository the fake GitHub knows. `refs` maps branches, tags and short SHAs to full SHAs. */
export interface FakeRepository {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  readonly refs: Readonly<Record<string, string>>;
  readonly archive: Buffer;
  readonly licence?: string;
  readonly isPrivate?: boolean;
}

export interface FakeGitHubBehaviour {
  /** When set, every API call answers 403 with the rate-limit headers and this reset time (epoch seconds). */
  rateLimitResetAt?: number;
  /** Host the tarball request redirects to; the default is codeload.github.com. */
  tarballHost?: string;
  /** Scheme of the redirect; the default is https. */
  tarballScheme?: string;
  /** Status the tarball download answers instead of 200. */
  tarballStatus?: number;
  /** Serves only this many bytes of the archive, to fake a download cut off half way. */
  tarballTruncateTo?: number;
}

export interface RecordedRequest {
  readonly method: string;
  readonly url: string;
  readonly authorization: string | undefined;
}

const FAKE_HOST_HEADER = 'x-rosetta-fake-host';
const SHA_ACCEPT = 'application/vnd.github.sha';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  });
}

function notFound(): Response {
  return json(404, { message: 'Not Found' });
}

/**
 * RF-120..RF-127 test double of the GitHub REST API and the archive host. `fetch` answers in process;
 * `listen()` serves the same answers over loopback HTTP for tests that need a socket.
 */
export class FakeGitHub {
  readonly requests: RecordedRequest[] = [];
  behaviour: FakeGitHubBehaviour;
  private readonly repositories: readonly FakeRepository[];

  constructor(repositories: readonly FakeRepository[], behaviour: FakeGitHubBehaviour = {}) {
    this.repositories = repositories;
    this.behaviour = behaviour;
  }

  readonly fetch: FetchFunction = (url, init) => {
    const headers = new Headers(init.headers);
    return Promise.resolve(this.handle(url, headers, init.method ?? 'GET'));
  };

  handle(url: URL, headers: Headers, method: string): Response {
    this.requests.push({
      method,
      url: url.toString(),
      authorization: headers.get('authorization') ?? undefined,
    });
    if (url.host === 'api.github.com') return this.api(url, headers);
    if (url.host === (this.behaviour.tarballHost ?? 'codeload.github.com'))
      return this.archive(url);
    return notFound();
  }

  /** Starts a loopback HTTP server; requests carry the GitHub host in `x-rosetta-fake-host`. */
  async listen(): Promise<{ readonly url: string; close(): Promise<void> }> {
    const server = createServer((request, response) => {
      this.serve(request, response).catch((error: unknown) => {
        response.statusCode = 500;
        response.end(error instanceof Error ? error.message : 'error');
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') {
      throw new Error('The fake GitHub server has no TCP address.');
    }
    return {
      url: `http://127.0.0.1:${String(address.port)}`,
      close: () =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
        }),
    };
  }

  private async serve(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const host = request.headers[FAKE_HOST_HEADER];
    const url = new URL(
      request.url ?? '/',
      `https://${typeof host === 'string' ? host : 'invalid'}`,
    );
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') headers.set(name, value);
    }
    const answer = this.handle(url, headers, request.method ?? 'GET');
    response.statusCode = answer.status;
    answer.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(Buffer.from(await answer.arrayBuffer()));
  }

  private find(owner: string, repo: string): FakeRepository | undefined {
    return this.repositories.find(
      (candidate) =>
        candidate.owner.toLowerCase() === owner.toLowerCase() &&
        candidate.repo.toLowerCase() === repo.toLowerCase(),
    );
  }

  private api(url: URL, headers: Headers): Response {
    const reset = this.behaviour.rateLimitResetAt;
    if (reset !== undefined) {
      return json(
        403,
        { message: 'API rate limit exceeded for 203.0.113.7.' },
        {
          'x-ratelimit-limit': '60',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset': String(reset),
        },
      );
    }
    const match = /^\/repos\/([^/]+)\/([^/]+)(?:\/(commits|tarball)\/(.+))?$/.exec(url.pathname);
    if (match === null) return notFound();
    const [, owner = '', repo = '', kind, ref = ''] = match;
    const repository = this.find(owner, repo);
    if (repository === undefined) return notFound();
    if (repository.isPrivate === true && !headers.has('authorization')) return notFound();
    if (kind === undefined) return this.repositoryJson(repository);
    const sha = repository.refs[decodeURIComponent(ref)];
    if (sha === undefined) {
      return /^[0-9a-f]{7,40}$/i.test(ref)
        ? json(422, { message: `No commit found for SHA: ${ref}` })
        : notFound();
    }
    if (kind === 'commits') {
      return headers.get('accept')?.includes(SHA_ACCEPT) === true
        ? new Response(sha, { status: 200, headers: { 'content-type': SHA_ACCEPT } })
        : json(406, { message: 'Unsupported Accept header' });
    }
    const host = this.behaviour.tarballHost ?? 'codeload.github.com';
    const location = `${this.behaviour.tarballScheme ?? 'https'}://${host}/${repository.owner}/${repository.repo}/legacy.tar.gz/${sha}`;
    return new Response(null, { status: 302, headers: { location } });
  }

  private repositoryJson(repository: FakeRepository): Response {
    return json(200, {
      name: repository.repo,
      full_name: `${repository.owner}/${repository.repo}`,
      owner: { login: repository.owner },
      private: repository.isPrivate ?? false,
      default_branch: repository.defaultBranch,
      license: repository.licence === undefined ? null : { spdx_id: repository.licence },
    });
  }

  private archive(url: URL): Response {
    const match = /^\/([^/]+)\/([^/]+)\/legacy\.tar\.gz\/([0-9a-f]{40})$/.exec(url.pathname);
    if (match === null) return notFound();
    const [, owner = '', repo = '', sha = ''] = match;
    const repository = this.find(owner, repo);
    if (repository === undefined || !Object.values(repository.refs).includes(sha))
      return notFound();
    if (this.behaviour.tarballStatus !== undefined) {
      return new Response('unavailable', { status: this.behaviour.tarballStatus });
    }
    const bytes = repository.archive.subarray(
      0,
      this.behaviour.tarballTruncateTo ?? repository.archive.length,
    );
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        'content-type': 'application/x-gzip',
        'content-length': String(repository.archive.length),
      },
    });
  }
}

/** A `fetch` that sends every GitHub URL to the loopback server of `FakeGitHub.listen()`. */
export function loopbackFetch(serverUrl: string): FetchFunction {
  return (url, init) => {
    const target = new URL(`${url.pathname}${url.search}`, serverUrl);
    const headers = new Headers(init.headers);
    headers.set(FAKE_HOST_HEADER, url.host);
    return globalThis.fetch(target, { ...init, headers });
  };
}

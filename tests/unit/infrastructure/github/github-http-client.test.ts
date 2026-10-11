import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  GitHubHttpClient,
  type FetchFunction,
} from '../../../../src/infrastructure/github/github-http-client.js';
import { FakeGitHub, type FakeGitHubBehaviour } from '../../../support/fake-github.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { FIXTURE_SHA } from '../../../support/snapshot-fixtures.js';

// FAKE token (RNF-003): built from harmless pieces, never a credential.
const fakeToken = ['ghp', 'FAKE0'.repeat(8)].join('_');
const api = new URL('https://api.github.com/repos/Octo/Demo');
const tarball = new URL(`https://api.github.com/repos/Octo/Demo/tarball/${FIXTURE_SHA}`);
const resetAt = 1791714600;
const resetIso = '2026-10-11T10:30:00.000Z';

function fakeGitHub(behaviour: FakeGitHubBehaviour = {}): FakeGitHub {
  return new FakeGitHub(
    [
      {
        owner: 'Octo',
        repo: 'Demo',
        defaultBranch: 'main',
        refs: { main: FIXTURE_SHA },
        archive: Buffer.from('not read by these tests'),
        licence: 'MIT',
      },
    ],
    behaviour,
  );
}

function harness(
  fetch: FetchFunction,
  token?: string,
): { client: GitHubHttpClient; logger: MemoryLogger } {
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
  return { client: new GitHubHttpClient({ fetch, token, logger }), logger };
}

const options = {
  accept: 'application/vnd.github+json',
  signal: new AbortController().signal,
  timeoutMs: 5_000,
  notFound: 'RST-1903',
} as const;

describe('GitHubHttpClient hosts and redirects', () => {
  it('RF-127 refuses a URL outside the GitHub hosts before any request is made', async () => {
    const github = fakeGitHub();
    const { client } = harness(github.fetch);

    await expect(
      client.get(new URL('https://example.com/repos/Octo/Demo'), options),
    ).rejects.toMatchObject({ code: 'RST-1904' });
    expect(github.requests).toEqual([]);
  });

  it('RF-127 follows a redirect to codeload.github.com', async () => {
    const github = fakeGitHub();
    const { client } = harness(github.fetch);

    const response = await client.get(tarball, options);

    expect(response.status).toBe(200);
    expect(github.requests.map((request) => new URL(request.url).host)).toEqual([
      'api.github.com',
      'codeload.github.com',
    ]);
  });

  it('RF-127 refuses a redirect to another host and never contacts it', async () => {
    const github = fakeGitHub({ tarballHost: 'evil.example' });
    const { client, logger } = harness(github.fetch);

    await expect(client.get(tarball, options)).rejects.toMatchObject({ code: 'RST-1904' });

    expect(github.requests.map((request) => new URL(request.url).host)).toEqual(['api.github.com']);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({ logger: 'security', code: 'RST-1904' }),
    );
    expect(logger.text()).toContain('evil.example');
  });

  it('RF-127 refuses a redirect that drops to http', async () => {
    const github = fakeGitHub({ tarballScheme: 'http' });
    const { client } = harness(github.fetch);

    await expect(client.get(tarball, options)).rejects.toMatchObject({ code: 'RST-1904' });
    expect(github.requests).toHaveLength(1);
  });
});

describe('GitHubHttpClient rate limits and the token', () => {
  it('RF-123 reports a rate limit with the reset time and the GITHUB_TOKEN hint', async () => {
    const github = fakeGitHub({ rateLimitResetAt: resetAt });
    const { client } = harness(github.fetch);

    const failure = client.get(api, options);

    await expect(failure).rejects.toMatchObject({ code: 'RST-1902' });
    await expect(failure).rejects.toThrow(resetIso);
    await expect(failure).rejects.toThrow('GITHUB_TOKEN');
  });

  it('RF-123 sends the token as a bearer to every GitHub host when it is set', async () => {
    const github = fakeGitHub();
    const { client } = harness(github.fetch, fakeToken);

    await client.get(tarball, options);

    expect(github.requests.map((request) => request.authorization)).toEqual([
      `Bearer ${fakeToken}`,
      `Bearer ${fakeToken}`,
    ]);
  });

  it('RF-123 sends no authorization header when no token is set', async () => {
    const github = fakeGitHub();
    const { client } = harness(github.fetch);

    await client.get(api, options);

    expect(github.requests.map((request) => request.authorization)).toEqual([undefined]);
  });

  it('RF-123 never writes the token into an error or the log', async () => {
    // Recorded unmasked: MemoryLogger would hide a leaked token behind the masker.
    const logger = new RecordingLogger();
    const scenarios = [
      { github: fakeGitHub({ rateLimitResetAt: resetAt }), url: api },
      { github: fakeGitHub({ tarballHost: 'evil.example' }), url: tarball },
    ];

    const messages: string[] = [];
    for (const { github, url } of scenarios) {
      const client = new GitHubHttpClient({ fetch: github.fetch, token: fakeToken, logger });
      await client
        .get(url, options)
        .catch((error: unknown) => messages.push(error instanceof Error ? error.message : ''));
    }

    expect(messages).toHaveLength(2);
    expect(messages.join(' ')).not.toContain(fakeToken);
    expect(logger.records.length).toBeGreaterThan(0);
    expect(logger.text()).not.toContain(fakeToken);
  });
});

describe('GitHubHttpClient failures', () => {
  it("RF-120 maps a 404 answer to the caller's not-found code", async () => {
    const github = fakeGitHub();
    const { client } = harness(github.fetch);

    await expect(
      client.get(new URL('https://api.github.com/repos/Octo/Missing'), options),
    ).rejects.toMatchObject({ code: 'RST-1903' });
  });

  it('RF-127 maps a server error to RST-1907', async () => {
    const github = fakeGitHub({ tarballStatus: 503 });
    const { client } = harness(github.fetch);

    await expect(client.get(tarball, options)).rejects.toMatchObject({ code: 'RST-1907' });
  });

  it('RF-127 wraps a failed connection as RST-1907 with the cause', async () => {
    const failing: FetchFunction = () => Promise.reject(new TypeError('fetch failed'));
    const { client } = harness(failing);

    const failure: unknown = await client.get(api, options).catch((error: unknown) => error);

    expect(failure).toMatchObject({ code: 'RST-1907' });
    expect(failure).toHaveProperty('cause.message', 'fetch failed');
  });

  it("RF-127 rethrows the caller's abort unchanged", async () => {
    const controller = new AbortController();
    controller.abort(new Error('run stopped'));
    const { client } = harness(fakeGitHub().fetch);

    await expect(client.get(api, { ...options, signal: controller.signal })).rejects.toThrow(
      'run stopped',
    );
  });
});

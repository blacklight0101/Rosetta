import { describe, expect, it } from 'vitest';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import {
  GitHubHttpClient,
  type FetchFunction,
} from '../../../../src/infrastructure/github/github-http-client.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';

/** A fetch that never answers until its signal aborts, like a stalled connection. */
const stalled: FetchFunction = (_url, init) =>
  new Promise((_resolve, reject) => {
    init.signal?.addEventListener('abort', () => {
      reject(init.signal?.reason instanceof Error ? init.signal.reason : new Error('aborted'));
    });
  });

describe('GitHubHttpClient timeout', () => {
  it('RF-127 a request that does not answer in time fails with RST-1907', async () => {
    const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
    const client = new GitHubHttpClient({ fetch: stalled, token: undefined, logger });

    await expect(
      client.get(new URL('https://api.github.com/repos/Octo/Demo'), {
        accept: 'application/vnd.github+json',
        signal: new AbortController().signal,
        timeoutMs: 20,
        notFound: 'RST-1903',
      }),
    ).rejects.toMatchObject({ code: 'RST-1907' });
  });
});

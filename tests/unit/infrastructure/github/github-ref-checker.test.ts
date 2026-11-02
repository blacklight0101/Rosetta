import { describe, expect, it } from 'vitest';
import type { GitHubRepoRef } from '../../../../src/domain/sources/github-repo-ref.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { GitHubApi } from '../../../../src/infrastructure/github/github-api.js';
import { GitHubHttpClient } from '../../../../src/infrastructure/github/github-http-client.js';
import { GitHubRefChecker } from '../../../../src/infrastructure/github/github-ref-checker.js';
import { FakeGitHub, type FakeRepository } from '../../../support/fake-github.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { FIXTURE_SHA } from '../../../support/snapshot-fixtures.js';

// RF-010, EV-70: the GitHub side of the ref check at create.

const signal = new AbortController().signal;

const demo: FakeRepository = {
  owner: 'Octo',
  repo: 'Demo',
  defaultBranch: 'main',
  refs: { main: FIXTURE_SHA },
  archive: Buffer.alloc(0),
  licence: 'MIT',
};

function checker(repositories: readonly FakeRepository[]): GitHubRefChecker {
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
  const github = new FakeGitHub(repositories);
  const client = new GitHubHttpClient({ fetch: github.fetch, token: undefined, logger });
  return new GitHubRefChecker(new GitHubApi(client, 5_000));
}

const ref = (name: string, repo = 'demo'): GitHubRepoRef => ({
  owner: 'octo',
  repo,
  ref: name,
  subpath: undefined,
});

describe('GitHubRefChecker', () => {
  it('RF-010 EV-70 answers found for a branch the repository has', async () => {
    await expect(checker([demo]).check(ref('main'), signal)).resolves.toBe('found');
  });

  it('RF-010 EV-70 answers missing for a branch it does not have (RST-1901)', async () => {
    await expect(checker([demo]).check(ref('master'), signal)).resolves.toBe('missing');
  });

  it('RF-010 EV-70 answers unreachable when the repository itself cannot be read', async () => {
    await expect(checker([demo]).check(ref('main', 'gone'), signal)).resolves.toBe('unreachable');
  });
});

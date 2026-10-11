import { describe, expect, it } from 'vitest';
import type { GitHubRepoRef } from '../../../../src/domain/sources/github-repo-ref.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { GitHubApi } from '../../../../src/infrastructure/github/github-api.js';
import { GitHubHttpClient } from '../../../../src/infrastructure/github/github-http-client.js';
import { FakeGitHub, type FakeRepository } from '../../../support/fake-github.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { FIXTURE_SHA } from '../../../support/snapshot-fixtures.js';

const otherSha = '9d5e3b0f7a1c2d4e6f8a0b1c2d3e4f5a6b7c8d9e';
const signal = new AbortController().signal;

const demo: FakeRepository = {
  owner: 'Octo',
  repo: 'Demo',
  defaultBranch: 'main',
  refs: {
    main: FIXTURE_SHA,
    'v1.0': otherSha,
    [otherSha.slice(0, 7)]: otherSha,
    [FIXTURE_SHA]: FIXTURE_SHA,
  },
  archive: Buffer.alloc(0),
  licence: 'MIT',
};

function api(repositories: readonly FakeRepository[], token?: string): GitHubApi {
  const logger = new MemoryLogger(new FixedClock('2026-10-11T09:00:00.000Z'), new SecretMasker());
  const github = new FakeGitHub(repositories);
  return new GitHubApi(new GitHubHttpClient({ fetch: github.fetch, token, logger }), 5_000);
}

const ref = (overrides: Partial<GitHubRepoRef> = {}): GitHubRepoRef => ({
  owner: 'octo',
  repo: 'demo',
  ref: undefined,
  subpath: undefined,
  ...overrides,
});

describe('GitHubApi repository', () => {
  it('RF-120 returns the names as GitHub spells them, the default branch and the licence', async () => {
    await expect(api([demo]).repository(ref(), signal)).resolves.toEqual({
      owner: 'Octo',
      repo: 'Demo',
      defaultBranch: 'main',
      licence: 'MIT',
    });
  });

  it('RF-126 reports the licence as unknown when GitHub lists none', async () => {
    const unlicensed: FakeRepository = { ...demo, licence: undefined };

    await expect(api([unlicensed]).repository(ref(), signal)).resolves.toMatchObject({
      licence: 'unknown',
    });
  });

  it('RF-120 stops with RST-1903 for a missing repository', async () => {
    await expect(api([]).repository(ref(), signal)).rejects.toMatchObject({ code: 'RST-1903' });
  });

  it('RF-120 stops with RST-1903 for a private repository even when a token can see it', async () => {
    const hidden: FakeRepository = { ...demo, isPrivate: true };
    // FAKE token (RNF-003), built from pieces.
    const token = ['ghp', 'FAKE0'.repeat(8)].join('_');

    await expect(api([hidden], token).repository(ref(), signal)).rejects.toMatchObject({
      code: 'RST-1903',
    });
  });
});

describe('GitHubApi commitSha', () => {
  it.each([
    ['a branch', 'main', FIXTURE_SHA],
    ['a tag', 'v1.0', otherSha],
    ['a short SHA', otherSha.slice(0, 7), otherSha],
    ['a full SHA', FIXTURE_SHA, FIXTURE_SHA],
  ])('RF-121 resolves %s to the full commit SHA', async (_name, refName, expected) => {
    await expect(api([demo]).commitSha(ref(), refName, signal)).resolves.toEqual({
      value: expected,
    });
  });

  it('RF-121 stops with RST-1901 for a ref the repository does not have', async () => {
    await expect(api([demo]).commitSha(ref(), 'nope', signal)).rejects.toMatchObject({
      code: 'RST-1901',
    });
  });
});

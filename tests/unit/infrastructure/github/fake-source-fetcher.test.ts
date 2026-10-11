import { describe, expect, it } from 'vitest';
import type { GitHubRepoRef } from '../../../../src/domain/sources/github-repo-ref.js';
import {
  FakeSourceFetcher,
  type FakeSnapshotEntry,
} from '../../../../src/infrastructure/github/fake-source-fetcher.js';
import { sourceFetcherContract } from '../../../contracts/source-fetcher.contract.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { FIXTURE_SHA } from '../../../support/snapshot-fixtures.js';

const entry: FakeSnapshotEntry = {
  owner: 'Octo',
  repo: 'Demo',
  defaultBranch: 'main',
  refs: { main: FIXTURE_SHA },
  rootDir: `/data/sources/octo__demo@${FIXTURE_SHA}/files`,
  snapshotHash: `sha256:${'0'.repeat(64)}`,
  fileCount: 4,
  totalBytes: 157,
  licence: 'MIT',
};

const newFetcher = (): FakeSourceFetcher =>
  new FakeSourceFetcher([entry], new FixedClock('2026-10-11T09:05:03.007Z'));

sourceFetcherContract('FakeSourceFetcher', () =>
  Promise.resolve({
    fetcher: newFetcher(),
    known: {
      url: 'https://github.com/octo/demo',
      owner: 'Octo',
      repo: 'Demo',
      commitSha: FIXTURE_SHA,
    },
    missingUrl: 'https://github.com/octo/private',
  }),
);

const ref = (refName: string | undefined): GitHubRepoRef => ({
  owner: 'Octo',
  repo: 'Demo',
  ref: refName,
  subpath: undefined,
});

describe('FakeSourceFetcher', () => {
  it('RF-121 records every fetch so a use-case test can assert what was asked', async () => {
    const fetcher = newFetcher();

    await fetcher.fetch(ref('main'), new AbortController().signal);

    expect(fetcher.fetched).toEqual([ref('main')]);
  });

  it('RF-121 stops with RST-1901 for a ref it does not know', async () => {
    await expect(
      newFetcher().fetch(ref('nope'), new AbortController().signal),
    ).rejects.toMatchObject({ code: 'RST-1901' });
  });

  it('RF-126 reports the snapshot fields a manifest needs', async () => {
    const snapshot = await newFetcher().fetch(ref(undefined), new AbortController().signal);

    expect(snapshot).toMatchObject({
      resolvedFrom: 'main',
      downloadedAt: '2026-10-11T09:05:03.007Z',
      fileCount: 4,
      totalBytes: 157,
      skippedLinks: 0,
      licence: 'MIT',
      rootDir: entry.rootDir,
    });
  });
});

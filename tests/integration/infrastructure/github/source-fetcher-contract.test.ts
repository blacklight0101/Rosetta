import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { GitHubSnapshotFetcher } from '../../../../src/infrastructure/github/github-snapshot-fetcher.js';
import { sourceFetcherContract } from '../../../contracts/source-fetcher.contract.js';
import { FakeGitHub } from '../../../support/fake-github.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import { FIXTURE_SHA, fixtureArchive } from '../../../support/snapshot-fixtures.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-fetcher-contract-');

sourceFetcherContract('GitHubSnapshotFetcher', async () => {
  const clock = new FixedClock('2026-10-11T09:05:03.007Z');
  const github = new FakeGitHub([
    {
      owner: 'Octo',
      repo: 'Demo',
      defaultBranch: 'main',
      refs: { main: FIXTURE_SHA },
      archive: await fixtureArchive('normal'),
      licence: 'MIT',
    },
  ]);
  return {
    fetcher: new GitHubSnapshotFetcher({
      dataDir: root.path,
      clock,
      idGenerator: new SequenceIdGenerator(),
      logger: new MemoryLogger(clock, new SecretMasker()),
      githubToken: undefined,
      fetch: github.fetch,
    }),
    known: {
      url: 'https://github.com/octo/demo',
      owner: 'Octo',
      repo: 'Demo',
      commitSha: FIXTURE_SHA,
    },
    missingUrl: 'https://github.com/octo/private',
  };
});

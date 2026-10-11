import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parseGitHubUrl } from '../../../../src/domain/sources/github-repo-ref.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import { GitHubSnapshotFetcher } from '../../../../src/infrastructure/github/github-snapshot-fetcher.js';
import { FakeGitHub, loopbackFetch } from '../../../support/fake-github.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import { FIXTURE_SHA, fixtureArchive, NORMAL_FILES } from '../../../support/snapshot-fixtures.js';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-fake-github-');
let server: { readonly url: string; close(): Promise<void> };
let github: FakeGitHub;

beforeEach(async () => {
  github = new FakeGitHub([
    {
      owner: 'Octo',
      repo: 'Demo',
      defaultBranch: 'main',
      refs: { main: FIXTURE_SHA },
      archive: await fixtureArchive('normal'),
      licence: 'MIT',
    },
  ]);
  server = await github.listen();
});

afterEach(async () => {
  await server.close();
});

describe('FakeGitHub over loopback HTTP', () => {
  it('RF-122 serves the API and the archive to the real fetcher through a socket', async () => {
    const clock = new FixedClock('2026-10-11T09:05:03.007Z');
    const fetcher = new GitHubSnapshotFetcher({
      dataDir: root.path,
      clock,
      idGenerator: new SequenceIdGenerator(),
      logger: new MemoryLogger(clock, new SecretMasker()),
      githubToken: undefined,
      fetch: loopbackFetch(server.url),
    });
    const ref = parseGitHubUrl('https://github.com/Octo/Demo');
    if (!ref.ok) throw new Error('fixture URL must parse');

    const snapshot = await fetcher.fetch(ref.value, new AbortController().signal);

    expect(snapshot.commitSha).toBe(FIXTURE_SHA);
    expect(await listTree(snapshot.rootDir)).toEqual(Object.keys(NORMAL_FILES).sort());
    expect(github.requests.map((request) => new URL(request.url).host)).toEqual([
      'api.github.com',
      'api.github.com',
      'api.github.com',
      'codeload.github.com',
    ]);
  });
});

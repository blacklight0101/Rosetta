import { createHash } from 'node:crypto';
import type { Snapshot } from '../../src/application/ports/source-fetcher.js';
import type { GitHubRepoRef } from '../../src/domain/sources/github-repo-ref.js';
import { SecretMasker } from '../../src/infrastructure/guards/secret-masker.js';
import type { FetchFunction } from '../../src/infrastructure/github/github-http-client.js';
import {
  GitHubSnapshotFetcher,
  type GitHubSnapshotFetcherOptions,
} from '../../src/infrastructure/github/github-snapshot-fetcher.js';
import { FakeGitHub, type FakeGitHubBehaviour } from './fake-github.js';
import { FixedClock } from './fixed-clock.js';
import { MemoryLogger } from './memory-logger.js';
import { SequenceIdGenerator } from './sequence-id-generator.js';
import { FIXTURE_SHA, fixtureArchive, type SnapshotFixture } from './snapshot-fixtures.js';

/** The instant every fixed clock of these tests shows. */
export const FETCH_INSTANT = '2026-10-11T09:05:03.007Z';
/** The snapshot folder name of the fixture commit of `octo/demo`. */
export const FIXTURE_KEY = `octo__demo@${FIXTURE_SHA}`;

const demoRef = (overrides: Partial<GitHubRepoRef> = {}): GitHubRepoRef => ({
  owner: 'octo',
  repo: 'demo',
  ref: undefined,
  subpath: undefined,
  ...overrides,
});

/** A fake GitHub that knows `Octo/Demo` at the fixture commit and serves the given archive. */
export async function demoGitHub(
  fixture: SnapshotFixture,
  behaviour: FakeGitHubBehaviour = {},
): Promise<FakeGitHub> {
  return new FakeGitHub(
    [
      {
        owner: 'Octo',
        repo: 'Demo',
        defaultBranch: 'main',
        refs: { main: FIXTURE_SHA, [FIXTURE_SHA]: FIXTURE_SHA },
        archive: await fixtureArchive(fixture),
        licence: 'MIT',
      },
    ],
    behaviour,
  );
}

export interface FetcherHarness {
  readonly fetcher: GitHubSnapshotFetcher;
  readonly logger: MemoryLogger;
  readonly fetch: (overrides?: Partial<GitHubRepoRef>) => Promise<Snapshot>;
}

/** A fetcher on `dataDir` with a fixed clock, sequence ids and a memory logger. */
export function fetcherHarness(
  dataDir: string,
  fetch: FetchFunction,
  overrides: Partial<GitHubSnapshotFetcherOptions> = {},
): FetcherHarness {
  const logger = new MemoryLogger(new FixedClock(FETCH_INSTANT), new SecretMasker());
  const fetcher = new GitHubSnapshotFetcher({
    dataDir,
    clock: new FixedClock(FETCH_INSTANT),
    idGenerator: new SequenceIdGenerator(),
    logger,
    githubToken: undefined,
    fetch,
    ...overrides,
  });
  return {
    fetcher,
    logger,
    fetch: (refOverrides = {}) =>
      fetcher.fetch(demoRef(refOverrides), new AbortController().signal),
  };
}

/** The reference `snapshotHash` of a tree, computed independently of the store. */
export function expectedSnapshotHash(files: Readonly<Record<string, string>>): string {
  const lines = Object.entries(files)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([path, content]) => `${path}\0${createHash('sha256').update(content).digest('hex')}\n`)
    .join('');
  return `sha256:${createHash('sha256').update(lines).digest('hex')}`;
}

/** How many recorded requests went to exactly `hostname` (compared on the parsed URL, not a substring). */
export const requestsToHost = (github: FakeGitHub, hostname: string): number =>
  github.requests.filter((request) => new URL(request.url).hostname === hostname).length;

export const codeloadRequests = (github: FakeGitHub): number =>
  requestsToHost(github, 'codeload.github.com');

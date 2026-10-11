import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Snapshot } from '../../../../src/application/ports/source-fetcher.js';
import type { GitHubRepoRef } from '../../../../src/domain/sources/github-repo-ref.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import type { FetchFunction } from '../../../../src/infrastructure/github/github-http-client.js';
import {
  GitHubSnapshotFetcher,
  type GitHubSnapshotFetcherOptions,
} from '../../../../src/infrastructure/github/github-snapshot-fetcher.js';
import { FakeGitHub, type FakeGitHubBehaviour } from '../../../support/fake-github.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { MemoryLogger } from '../../../support/memory-logger.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import {
  FIXTURE_SHA,
  fixtureArchive,
  NORMAL_FILES,
  type SnapshotFixture,
} from '../../../support/snapshot-fixtures.js';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-snapshots-');
const instant = '2026-10-11T09:05:03.007Z';
const key = `octo__demo@${FIXTURE_SHA}`;
// FAKE token (RNF-003), built from pieces.
const fakeToken = ['ghp', 'FAKE0'.repeat(8)].join('_');

const ref = (overrides: Partial<GitHubRepoRef> = {}): GitHubRepoRef => ({
  owner: 'octo',
  repo: 'demo',
  ref: undefined,
  subpath: undefined,
  ...overrides,
});

async function fakeGitHub(
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

interface Harness {
  readonly fetcher: GitHubSnapshotFetcher;
  readonly logger: MemoryLogger;
  readonly fetch: (overrides?: Partial<GitHubRepoRef>) => Promise<Snapshot>;
}

function harness(
  fetch: FetchFunction,
  overrides: Partial<GitHubSnapshotFetcherOptions> = {},
): Harness {
  const logger = new MemoryLogger(new FixedClock(instant), new SecretMasker());
  const fetcher = new GitHubSnapshotFetcher({
    dataDir: root.path,
    clock: new FixedClock(instant),
    idGenerator: new SequenceIdGenerator(),
    logger,
    githubToken: undefined,
    fetch,
    ...overrides,
  });
  return {
    fetcher,
    logger,
    fetch: (refOverrides = {}) => fetcher.fetch(ref(refOverrides), new AbortController().signal),
  };
}

function expectedHash(files: Readonly<Record<string, string>>): string {
  const lines = Object.entries(files)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([path, content]) => `${path}\0${createHash('sha256').update(content).digest('hex')}\n`)
    .join('');
  return `sha256:${createHash('sha256').update(lines).digest('hex')}`;
}

const sourcesDir = (): string => join(root.path, 'sources');
const snapshotDir = (): string => join(sourcesDir(), key);
const codeloadRequests = (github: FakeGitHub): number =>
  github.requests.filter((request) => request.url.includes('codeload.github.com')).length;

describe('GitHubSnapshotFetcher download', () => {
  it('RF-122 downloads and extracts the archive into <data>/sources/<owner>__<repo>@<sha>/files/', async () => {
    const github = await fakeGitHub('normal');

    const snapshot = await harness(github.fetch).fetch();

    expect(snapshot.rootDir).toBe(join(snapshotDir(), 'files'));
    expect(await listTree(snapshot.rootDir)).toEqual(Object.keys(NORMAL_FILES).sort());
    expect(await readFile(join(snapshot.rootDir, 'src/App.cs'), 'utf8')).toBe(
      NORMAL_FILES['src/App.cs'],
    );
    expect(await readdir(sourcesDir())).toEqual([key]);
  });

  it('RF-126 writes snapshot.json with the source, the commit, the counts and the hash', async () => {
    const github = await fakeGitHub('normal');

    const snapshot = await harness(github.fetch).fetch();

    const written: unknown = JSON.parse(
      await readFile(join(snapshotDir(), 'snapshot.json'), 'utf8'),
    );
    expect(written).toEqual({
      schemaVersion: 1,
      url: 'https://github.com/Octo/Demo',
      owner: 'Octo',
      repo: 'Demo',
      commitSha: FIXTURE_SHA,
      resolvedFrom: 'main',
      downloadedAt: instant,
      fileCount: 4,
      totalBytes: 157,
      skippedLinks: 0,
      snapshotHash: expectedHash(NORMAL_FILES),
      licence: 'MIT',
    });
    expect(snapshot).toMatchObject({ ...(written as object), key, cached: false });
  });

  it('RF-121 records the ref that was asked for and resolves it through the API', async () => {
    const github = await fakeGitHub('normal');

    const snapshot = await harness(github.fetch).fetch({ ref: 'main' });

    expect(snapshot.commitSha).toBe(FIXTURE_SHA);
    expect(github.requests.map((request) => new URL(request.url).pathname)).toContain(
      '/repos/octo/demo/commits/main',
    );
  });

  it('RF-005 leaves the snapshot read-only: a later write is refused', async () => {
    const github = await fakeGitHub('normal');

    const snapshot = await harness(github.fetch).fetch();

    const readme = join(snapshot.rootDir, 'README.md');
    expect((await stat(readme)).mode & 0o222).toBe(0);
    await expect(writeFile(readme, 'changed', 'utf8')).rejects.toThrow();
    expect(await readFile(readme, 'utf8')).toBe(NORMAL_FILES['README.md']);
  });

  it('RF-123 sends the token to GitHub and keeps it out of the log', async () => {
    const github = await fakeGitHub('normal');
    const { fetch, logger } = harness(github.fetch, { githubToken: fakeToken });

    await fetch();

    expect(
      github.requests.every((request) => request.authorization === `Bearer ${fakeToken}`),
    ).toBe(true);
    expect(logger.entries.length).toBeGreaterThan(0);
    expect(logger.text()).not.toContain(fakeToken);
  });
});

describe('GitHubSnapshotFetcher cache', () => {
  it('RF-122 reuses a cached commit without downloading again', async () => {
    const github = await fakeGitHub('normal');
    const { fetch } = harness(github.fetch);
    const first = await fetch();

    const second = await fetch();

    expect(second).toEqual({ ...first, cached: true });
    expect(codeloadRequests(github)).toBe(1);
  });

  it('RF-122 serves a cached commit SHA with no network to GitHub at all', async () => {
    const github = await fakeGitHub('normal');
    await harness(github.fetch).fetch();
    const offline: FetchFunction = () => Promise.reject(new TypeError('network is down'));

    const snapshot = await harness(offline).fetch({ ref: FIXTURE_SHA });

    expect(snapshot.cached).toBe(true);
    expect(snapshot.rootDir).toBe(join(snapshotDir(), 'files'));
  });

  it('RF-122 two fetches of the same commit at the same time download it once', async () => {
    const github = await fakeGitHub('normal');
    const { fetch } = harness(github.fetch);

    const [first, second] = await Promise.all([fetch(), fetch({ ref: 'main' })]);

    expect(first.key).toBe(key);
    expect(second.key).toBe(key);
    expect(codeloadRequests(github)).toBe(1);
    expect(await readdir(sourcesDir())).toEqual([key]);
  });
});

describe('GitHubSnapshotFetcher partial folders', () => {
  it('RF-122 a download that fails half way leaves no partial folder and restarts next time', async () => {
    const github = await fakeGitHub('normal', { tarballTruncateTo: 100 });
    const { fetch } = harness(github.fetch);

    await expect(fetch()).rejects.toMatchObject({ code: 'RST-1907' });
    expect(await readdir(sourcesDir())).toEqual([]);

    github.behaviour = {};
    const snapshot = await fetch();
    expect(snapshot.cached).toBe(false);
    expect(await listTree(snapshot.rootDir)).toEqual(Object.keys(NORMAL_FILES).sort());
  });

  it('RF-122 discards leftover partial folders at start-up and keeps complete snapshots', async () => {
    await mkdir(join(sourcesDir(), '.partial-left-over', 'files'), { recursive: true });
    await writeFile(join(sourcesDir(), '.partial-left-over', 'files', 'a.txt'), 'x', 'utf8');
    await mkdir(join(sourcesDir(), 'other__repo@0000000000000000000000000000000000000000'));
    const { fetcher } = harness((await fakeGitHub('normal')).fetch);

    const discarded = await fetcher.discardPartialFolders();

    expect(discarded).toEqual(['.partial-left-over']);
    expect(await readdir(sourcesDir())).toEqual([
      'other__repo@0000000000000000000000000000000000000000',
    ]);
  });

  it('RF-122 has nothing to discard before the sources folder exists', async () => {
    const { fetcher } = harness((await fakeGitHub('normal')).fetch);

    expect(await fetcher.discardPartialFolders()).toEqual([]);
  });
});

describe('GitHubSnapshotFetcher hostile archives', () => {
  it('RF-122 a path-traversal entry stops the fetch and writes nothing outside the snapshot folder', async () => {
    const github = await fakeGitHub('traversal');
    const { fetch, logger } = harness(github.fetch);

    await expect(fetch()).rejects.toMatchObject({ code: 'RST-1906' });

    expect(await listTree(root.path)).toEqual([]);
    expect(await readdir(root.path)).toEqual(['sources']);
    expect(await readdir(sourcesDir())).toEqual([]);
    expect(logger.entries).toContainEqual(
      expect.objectContaining({ logger: 'security', code: 'RST-1906' }),
    );
  });

  it('RF-127 symbolic and hard links are skipped and counted', async () => {
    const github = await fakeGitHub('links');
    const { fetch, logger } = harness(github.fetch);

    const snapshot = await fetch();

    expect(snapshot.skippedLinks).toBe(2);
    expect(snapshot.fileCount).toBe(4);
    expect(await listTree(snapshot.rootDir)).toEqual(Object.keys(NORMAL_FILES).sort());
    expect(logger.entries).toContainEqual(
      expect.objectContaining({ logger: 'security', code: 'RST-1906' }),
    );
  });

  it('RF-127 an archive over the byte limit stops the fetch and deletes the partial folder', async () => {
    const github = await fakeGitHub('oversized');
    const { fetch } = harness(github.fetch, { limits: { maxBytes: 16 * 1024 } });

    await expect(fetch()).rejects.toMatchObject({ code: 'RST-1905' });
    expect(await readdir(sourcesDir())).toEqual([]);
  });

  it('RF-127 an archive with too many entries stops the fetch and deletes the partial folder', async () => {
    const github = await fakeGitHub('many-entries');
    const { fetch } = harness(github.fetch, { limits: { maxEntries: 20 } });

    await expect(fetch()).rejects.toMatchObject({ code: 'RST-1905' });
    expect(await readdir(sourcesDir())).toEqual([]);
  });

  it('RF-127 a Content-Length over the byte limit stops the fetch before the download', async () => {
    const github = await fakeGitHub('normal');
    const { fetch } = harness(github.fetch, { limits: { maxBytes: 100 } });

    await expect(fetch()).rejects.toMatchObject({ code: 'RST-1905' });
    expect(await readdir(sourcesDir())).toEqual([]);
  });

  it('RF-127 a redirect to another host stops the fetch with RST-1904', async () => {
    const github = await fakeGitHub('normal', { tarballHost: 'evil.example' });
    const { fetch } = harness(github.fetch);

    await expect(fetch()).rejects.toMatchObject({ code: 'RST-1904' });
    expect(github.requests.some((request) => request.url.includes('evil.example'))).toBe(false);
    expect(await readdir(sourcesDir())).toEqual([]);
  });
});

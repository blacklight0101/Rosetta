import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { FetchFunction } from '../../../../src/infrastructure/github/github-http-client.js';
import {
  codeloadRequests,
  demoGitHub,
  expectedSnapshotHash,
  FETCH_INSTANT,
  fetcherHarness,
  FIXTURE_KEY,
} from '../../../support/snapshot-fetcher-harness.js';
import { RecordingLogger } from '../../../support/recording-logger.js';
import { FIXTURE_SHA, NORMAL_FILES } from '../../../support/snapshot-fixtures.js';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-snapshots-');
// FAKE token (RNF-003), built from pieces.
const fakeToken = ['ghp', 'FAKE0'.repeat(8)].join('_');

const sourcesDir = (): string => join(root.path, 'sources');
const snapshotDir = (): string => join(sourcesDir(), FIXTURE_KEY);
const harness = (
  ...args: Parameters<typeof fetcherHarness> extends [string, ...infer Rest] ? Rest : never
): ReturnType<typeof fetcherHarness> => fetcherHarness(root.path, ...args);

describe('GitHubSnapshotFetcher download', () => {
  it('RF-122 downloads and extracts the archive into <data>/sources/<owner>__<repo>@<sha>/files/', async () => {
    const github = await demoGitHub('normal');

    const snapshot = await harness(github.fetch).fetch();

    expect(snapshot.rootDir).toBe(join(snapshotDir(), 'files'));
    expect(await listTree(snapshot.rootDir)).toEqual(Object.keys(NORMAL_FILES).sort());
    expect(await readFile(join(snapshot.rootDir, 'src/App.cs'), 'utf8')).toBe(
      NORMAL_FILES['src/App.cs'],
    );
    expect(await readdir(sourcesDir())).toEqual([FIXTURE_KEY]);
  });

  it('RF-126 writes snapshot.json with the source, the commit, the counts and the hash', async () => {
    const github = await demoGitHub('normal');
    const expectedInfo = {
      url: 'https://github.com/Octo/Demo',
      owner: 'Octo',
      repo: 'Demo',
      commitSha: FIXTURE_SHA,
      resolvedFrom: 'main',
      downloadedAt: FETCH_INSTANT,
      fileCount: 4,
      totalBytes: 157,
      skippedLinks: 0,
      snapshotHash: expectedSnapshotHash(NORMAL_FILES),
      licence: 'MIT',
    };

    const snapshot = await harness(github.fetch).fetch();

    const written: unknown = JSON.parse(
      await readFile(join(snapshotDir(), 'snapshot.json'), 'utf8'),
    );
    expect(written).toEqual({ schemaVersion: 1, ...expectedInfo });
    expect(snapshot).toEqual({
      ...expectedInfo,
      key: FIXTURE_KEY,
      rootDir: join(snapshotDir(), 'files'),
      cached: false,
    });
  });
});

describe('GitHubSnapshotFetcher resolution and record', () => {
  it('RF-121 records the ref that was asked for and resolves it through the API', async () => {
    const github = await demoGitHub('normal');

    const snapshot = await harness(github.fetch).fetch({ ref: 'main' });

    expect(snapshot.commitSha).toBe(FIXTURE_SHA);
    expect(github.requests.map((request) => new URL(request.url).pathname)).toContain(
      '/repos/octo/demo/commits/main',
    );
  });

  it('RF-005 leaves the snapshot read-only: a later write is refused', async () => {
    const github = await demoGitHub('normal');

    const snapshot = await harness(github.fetch).fetch();

    const readme = join(snapshot.rootDir, 'README.md');
    expect((await stat(readme)).mode & 0o222).toBe(0);
    await expect(writeFile(readme, 'changed', 'utf8')).rejects.toThrow();
    expect(await readFile(readme, 'utf8')).toBe(NORMAL_FILES['README.md']);
  });

  it('RF-123 sends the token to GitHub and keeps it out of the log', async () => {
    const github = await demoGitHub('normal');
    // Recorded unmasked: MemoryLogger would hide a leaked token behind the masker.
    const logger = new RecordingLogger();
    const { fetch } = harness(github.fetch, { githubToken: fakeToken, logger });

    await fetch();

    expect(
      github.requests.every((request) => request.authorization === `Bearer ${fakeToken}`),
    ).toBe(true);
    expect(logger.records.length).toBeGreaterThan(0);
    expect(logger.text()).not.toContain(fakeToken);
  });
});

describe('GitHubSnapshotFetcher cache', () => {
  it('RF-122 reuses a cached commit without downloading again', async () => {
    const github = await demoGitHub('normal');
    const { fetch } = harness(github.fetch);
    const first = await fetch();

    const second = await fetch();

    expect(second).toEqual({ ...first, cached: true });
    expect(codeloadRequests(github)).toBe(1);
  });

  it('RF-122 serves a cached commit SHA with no network to GitHub at all', async () => {
    const github = await demoGitHub('normal');
    await harness(github.fetch).fetch();
    const offline: FetchFunction = () => Promise.reject(new TypeError('network is down'));

    const snapshot = await harness(offline).fetch({ ref: FIXTURE_SHA });

    expect(snapshot.cached).toBe(true);
    expect(snapshot.rootDir).toBe(join(snapshotDir(), 'files'));
  });

  it('RF-122 two fetches of the same commit at the same time download it once', async () => {
    const github = await demoGitHub('normal');
    const { fetch } = harness(github.fetch);

    const [first, second] = await Promise.all([fetch(), fetch({ ref: 'main' })]);

    expect(first.key).toBe(FIXTURE_KEY);
    expect(second.key).toBe(FIXTURE_KEY);
    expect(codeloadRequests(github)).toBe(1);
    expect(await readdir(sourcesDir())).toEqual([FIXTURE_KEY]);
  });
});

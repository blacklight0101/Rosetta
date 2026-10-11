import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { demoGitHub, fetcherHarness } from '../../../support/snapshot-fetcher-harness.js';
import { NORMAL_FILES } from '../../../support/snapshot-fixtures.js';
import { listTree, useWritableTempRoot } from '../../../support/writable-temp-root.js';

const root = useWritableTempRoot('rosetta-hostile-');
const sourcesDir = (): string => join(root.path, 'sources');
const harness = (
  ...args: Parameters<typeof fetcherHarness> extends [string, ...infer Rest] ? Rest : never
): ReturnType<typeof fetcherHarness> => fetcherHarness(root.path, ...args);

describe('GitHubSnapshotFetcher partial folders', () => {
  it('RF-122 a download that fails half way leaves no partial folder and restarts next time', async () => {
    const github = await demoGitHub('normal', { tarballTruncateTo: 100 });
    const { fetch } = harness(github.fetch);

    await expect(fetch()).rejects.toMatchObject({ code: 'RST-1907' });
    expect(await readdir(sourcesDir())).toEqual([]);

    github.behaviour = {};
    const snapshot = await fetch();
    expect(snapshot.cached).toBe(false);
    expect(await listTree(snapshot.rootDir)).toEqual(Object.keys(NORMAL_FILES).sort());
  });

  it('RF-122 discards leftover partial folders at start-up and keeps complete snapshots', async () => {
    const complete = 'other__repo@0000000000000000000000000000000000000000';
    await mkdir(join(sourcesDir(), '.partial-left-over', 'files'), { recursive: true });
    await writeFile(join(sourcesDir(), '.partial-left-over', 'files', 'a.txt'), 'x', 'utf8');
    await mkdir(join(sourcesDir(), complete));
    const { fetcher } = harness((await demoGitHub('normal')).fetch);

    const discarded = await fetcher.discardPartialFolders();

    expect(discarded).toEqual(['.partial-left-over']);
    expect(await readdir(sourcesDir())).toEqual([complete]);
  });

  it('RF-122 has nothing to discard before the sources folder exists', async () => {
    const { fetcher } = harness((await demoGitHub('normal')).fetch);

    expect(await fetcher.discardPartialFolders()).toEqual([]);
  });
});

describe('GitHubSnapshotFetcher hostile entries', () => {
  it('RF-122 a path-traversal entry stops the fetch and writes nothing outside the snapshot folder', async () => {
    const github = await demoGitHub('traversal');
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
    const github = await demoGitHub('links');
    const { fetch, logger } = harness(github.fetch);

    const snapshot = await fetch();

    expect(snapshot.skippedLinks).toBe(2);
    expect(snapshot.fileCount).toBe(4);
    expect(await listTree(snapshot.rootDir)).toEqual(Object.keys(NORMAL_FILES).sort());
    expect(logger.entries).toContainEqual(
      expect.objectContaining({ logger: 'security', code: 'RST-1906' }),
    );
  });
});

describe('GitHubSnapshotFetcher limits and hosts', () => {
  it('RF-127 an archive over the byte limit stops the fetch and deletes the partial folder', async () => {
    const github = await demoGitHub('oversized');
    const { fetch } = harness(github.fetch, { limits: { maxBytes: 16 * 1024 } });

    await expect(fetch()).rejects.toMatchObject({ code: 'RST-1905' });
    expect(await readdir(sourcesDir())).toEqual([]);
  });

  it('RF-127 an archive with too many entries stops the fetch and deletes the partial folder', async () => {
    const github = await demoGitHub('many-entries');
    const { fetch } = harness(github.fetch, { limits: { maxEntries: 20 } });

    await expect(fetch()).rejects.toMatchObject({ code: 'RST-1905' });
    expect(await readdir(sourcesDir())).toEqual([]);
  });

  it('RF-127 a Content-Length over the byte limit stops the fetch before the download', async () => {
    const github = await demoGitHub('normal');
    const { fetch } = harness(github.fetch, { limits: { maxBytes: 100 } });

    await expect(fetch()).rejects.toMatchObject({ code: 'RST-1905' });
    expect(await readdir(sourcesDir())).toEqual([]);
  });

  it('RF-127 a redirect to another host stops the fetch with RST-1904', async () => {
    const github = await demoGitHub('normal', { tarballHost: 'evil.example' });
    const { fetch } = harness(github.fetch);

    await expect(fetch()).rejects.toMatchObject({ code: 'RST-1904' });
    expect(github.requests.some((request) => request.url.includes('evil.example'))).toBe(false);
    expect(await readdir(sourcesDir())).toEqual([]);
  });
});

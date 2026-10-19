import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  demoGitHub,
  fetcherHarness,
  FIXTURE_KEY,
} from '../../../support/snapshot-fetcher-harness.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

// RF-130, RF-122: the GitHub fetcher answers with GitHub snapshots only. A folder under a GitHub
// key whose snapshot.json says `upload` is damaged, never served as the commit that was asked for.

const root = useWritableTempRoot('rosetta-fetcher-kinds-');

describe('GitHubSnapshotFetcher cache and the snapshot kind', () => {
  it('RF-130 refuses a cached folder of a GitHub key whose snapshot.json is an upload record', async () => {
    const github = await demoGitHub('normal');
    const folder = join(root.path, 'sources', FIXTURE_KEY);
    await mkdir(folder, { recursive: true });
    await writeFile(
      join(folder, 'snapshot.json'),
      JSON.stringify({
        schemaVersion: 1,
        kind: 'upload',
        fileName: 'OrderDesk.zip',
        uploadedAt: '2026-10-19T08:00:00.000Z',
        fileCount: 1,
        totalBytes: 1,
        skippedLinks: 0,
        snapshotHash: `sha256:${'c'.repeat(64)}`,
      }),
    );

    await expect(fetcherHarness(root.path, github.fetch).fetch()).rejects.toMatchObject({
      code: 'RST-1906',
    });
  });
});

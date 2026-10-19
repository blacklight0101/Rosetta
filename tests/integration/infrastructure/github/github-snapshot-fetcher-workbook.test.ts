import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  demoGitHub,
  fetcherHarness,
  FIXTURE_KEY,
} from '../../../support/snapshot-fetcher-harness.js';
import { workbookRecord } from '../../../support/workbook-source-fixtures.js';
import { useWritableTempRoot } from '../../../support/writable-temp-root.js';

// RF-152, RF-122: the GitHub fetcher answers with GitHub snapshots only. A folder under a GitHub
// key whose snapshot.json says `workbook` is damaged, never served as the commit that was asked for.

const root = useWritableTempRoot('rosetta-fetcher-workbook-');

describe('GitHubSnapshotFetcher cache and the workbook kind', () => {
  it('RF-152 refuses a cached folder of a GitHub key whose snapshot.json is a workbook record', async () => {
    const github = await demoGitHub('normal');
    const folder = join(root.path, 'sources', FIXTURE_KEY);
    await mkdir(folder, { recursive: true });
    await writeFile(join(folder, 'snapshot.json'), JSON.stringify(workbookRecord));

    await expect(fetcherHarness(root.path, github.fetch).fetch()).rejects.toMatchObject({
      code: 'RST-1906',
    });
  });
});

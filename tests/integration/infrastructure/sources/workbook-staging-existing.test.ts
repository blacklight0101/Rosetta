import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { storeIn } from '../../../support/upload-store-harness.js';
import {
  projectId,
  sampleBook,
  stageFiles,
  useStagingFolders,
} from '../../../support/workbook-staging-harness.js';

// RF-159, RF-128: a batch of workbooks whose content is already stored creates nothing and leaves the
// published snapshot as it was; it is named after the newest upload only once that upload is kept.

const folders = useStagingFolders(afterEach);
const signal = new AbortController().signal;

describe('DiskWorkbookStaging the same content published again', () => {
  it('RF-159 says it created nothing and leaves snapshot.json of the published snapshot as it was', async () => {
    const { staging, dataDir } = await folders();
    const book = await sampleBook();
    const first = await staging.publish((await stageFiles(staging, [['Pricing.xlsx', book]])).id, {
      ...{ projectId, uploadedAt: '2026-10-19T08:00:00.000Z', signal },
    });
    const file = join(dataDir, 'sources', first.key, 'snapshot.json');
    const before = await readFile(file, 'utf8');

    const second = await staging.publish((await stageFiles(staging, [['Pricing.xlsx', book]])).id, {
      ...{ projectId, uploadedAt: '2026-10-20T09:00:00.000Z', signal },
    });

    expect(first.created).toBe(true);
    expect(second).toMatchObject({ key: first.key, created: false });
    expect(second.info.uploadedAt).toBe('2026-10-20T09:00:00.000Z');
    expect(await readFile(file, 'utf8')).toBe(before);
  });

  it('RF-159 renames a workbook snapshot after the newest upload once it is kept', async () => {
    const { staging, dataDir } = await folders();
    const store = storeIn(dataDir);
    const book = await sampleBook();
    const first = await staging.publish((await stageFiles(staging, [['Pricing.xlsx', book]])).id, {
      ...{ projectId, uploadedAt: '2026-10-19T08:00:00.000Z', signal },
    });
    const second = await staging.publish((await stageFiles(staging, [['Pricing.xlsx', book]])).id, {
      ...{ projectId, uploadedAt: '2026-10-20T09:00:00.000Z', signal },
    });

    await store.rewriteInfo(second.key, second.info);

    const stored = await readFile(join(dataDir, 'sources', first.key, 'snapshot.json'), 'utf8');
    expect(stored).toContain('2026-10-20T09:00:00.000Z');
  });
});

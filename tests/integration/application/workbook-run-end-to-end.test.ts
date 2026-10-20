import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseCodeMap } from '../../../src/infrastructure/scan/codemap/codemap-json.js';
import { createScanRunHarness, scanActor } from '../../support/scan-run-harness.js';
import { storeIn } from '../../support/upload-store-harness.js';
import {
  projectId,
  sampleBook,
  stageFiles,
  uploadedAt,
  useStagingFolders,
} from '../../support/workbook-staging-harness.js';

// RF-152, RF-126, RF-150, RF-122: a batch of workbooks is published, and a scan reads its snapshot
// end to end: the code map names the workbooks, the manifest names them and their renderer, and no
// request goes to GitHub.

const folders = useStagingFolders(afterEach);

async function scanPublishedBatch() {
  const setup = await folders();
  const { id } = await stageFiles(setup.staging, [
    ['Pricing.xlsx', await sampleBook()],
    ['Rates.xlsx', await sampleBook()],
  ]);
  const signal = new AbortController().signal;
  const published = await setup.staging.publish(id, { projectId, uploadedAt, signal });
  const h = await createScanRunHarness({
    dataDir: setup.dataDir,
    project: {
      ...{ id: projectId, userId: scanActor.userId, sourceKind: 'workbook', sourceUrl: '' },
      ...{ ref: '', subpath: '', name: 'Pricing' },
      upload: {
        fileName: 'Pricing.xlsx, Rates.xlsx',
        uploadedAt: Date.parse(uploadedAt),
        snapshotKey: published.key,
        workbooks: 2,
      },
    },
    uploads: storeIn(setup.dataDir),
  });
  const run = await h.scan();
  const mapPath = join(
    ...[setup.dataDir, 'users', scanActor.userId, 'projects', projectId],
    ...['runs', run.runKey, 'codemap.json'],
  );
  return { h, run, published, map: parseCodeMap(await readFile(mapPath, 'utf8')) };
}

describe('a scan of an uploaded workbook project', () => {
  it('RF-152 reads the snapshot and completes without asking GitHub', async () => {
    const { h, run, published } = await scanPublishedBatch();

    expect(run).toMatchObject({ endState: 'Completed', snapshotKey: published.key });
    expect(h.fetcher.fetched).toEqual([]);
  });

  it('RF-126 the manifest names the workbooks, the renderer and the snapshot hash', async () => {
    const { h, run, published } = await scanPublishedBatch();

    expect((await h.manifestOf(run)).source).toMatchObject({
      kind: 'workbook',
      commitSha: null,
      snapshotHash: published.info.snapshotHash,
      rendererVersion: '1',
      workbooks: ['Pricing.xlsx', 'Rates.xlsx'],
    });
  });

  it('RF-152 the code map holds the rendered files of both workbooks and a workbook source', async () => {
    const { map, published } = await scanPublishedBatch();

    expect(map.ok).toBe(true);
    if (!map.ok) return;
    expect(map.value.source).toEqual({
      kind: 'workbook',
      workbooks: ['Pricing.xlsx', 'Rates.xlsx'],
      snapshotHash: published.info.snapshotHash,
      subpath: '',
    });
    const paths = map.value.files.map((file) => file.path);
    expect(paths).toContain('Pricing.xlsx/workbook.md');
    expect(paths).toContain('Rates.xlsx/Summary/values.md');
  });
});

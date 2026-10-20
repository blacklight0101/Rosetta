import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  createScanRunHarness,
  RecordingPipeline,
  scanActor,
} from '../../../support/scan-run-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';
import {
  fixtureWorkbooks,
  WORKBOOK_RUN_HASH,
  WORKBOOK_RUN_KEY,
  WORKBOOKS_UPLOADED_AT,
  workbookProjectFields,
} from '../../../support/workbook-run-fixtures.js';

// RF-152, RF-126, RF-156: RunScan on a workbook project reads the snapshot of its rendered workbooks,
// records the workbooks as the source of the run (no commit, no GitHub) and scans the same tree.

const temp = useTempRoot('rosetta-run-scan-workbook-');

async function workbooks(pipeline = new RecordingPipeline()) {
  const h = await createScanRunHarness({
    dataDir: temp.path,
    pipeline,
    project: { ...workbookProjectFields, userId: scanActor.userId },
    uploads: fixtureWorkbooks,
  });
  return { h, pipeline };
}

describe('RunScan a workbook project', () => {
  it('RF-152 records the snapshot, its hash, the renderer and the workbooks, and no commit', async () => {
    const { h } = await workbooks();

    const run = await h.scan();

    expect(run).toMatchObject({
      endState: 'Completed',
      commitSha: null,
      snapshotKey: WORKBOOK_RUN_KEY,
    });
    expect((await h.manifestOf(run)).source).toMatchObject({
      kind: 'workbook',
      url: '',
      owner: '',
      repo: '',
      ref: '',
      commitSha: null,
      subpath: '',
      snapshotHash: WORKBOOK_RUN_HASH,
      uploadedAt: WORKBOOKS_UPLOADED_AT,
      rendererVersion: '1',
      workbooks: ['Pricing.xlsx', 'Rates.xlsm'],
    });
    expect((await h.manifestOf(run)).source).not.toHaveProperty('fileName');
  });

  it('RF-152 names the kind in the manifest as soon as the run is accepted', async () => {
    const { h } = await workbooks();

    const run = await h.start();

    expect((await h.manifestOf(run)).source).toMatchObject({ kind: 'workbook' });
  });

  it('RF-152 publishes run.started, the read snapshot, the scan and the end; no commit event', async () => {
    const { h } = await workbooks();

    const events = await h.eventsOf(await h.scan());

    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'source.downloaded',
      'scan.completed',
      'run.ended',
    ]);
  });
});

describe('RunScan a workbook project: what is scanned', () => {
  it('RF-152 scans the snapshot tree and gives the code map a source with the workbooks and hash', async () => {
    const { h, pipeline } = await workbooks();

    await h.scan();

    expect(pipeline.requests[0]?.source).toEqual({
      kind: 'workbook',
      workbooks: ['Pricing.xlsx', 'Rates.xlsm'],
      snapshotHash: WORKBOOK_RUN_HASH,
      subpath: '',
    });
    expect(pipeline.requests[0]?.root).toMatch(/webforms-csharp$/u);
  });

  it('RF-122 never asks GitHub for a workbook project', async () => {
    const { h } = await workbooks();

    await h.scan();

    expect(h.fetcher.fetched).toEqual([]);
  });
});

describe('RunScan a workbook project whose snapshot is gone', () => {
  it('RF-152 fails with RST-1920 and scans nothing', async () => {
    const pipeline = new RecordingPipeline();
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline,
      project: { ...workbookProjectFields, userId: scanActor.userId },
      uploads: { read: () => Promise.resolve(undefined) },
    });

    const run = await h.scan();

    expect(run.endState).toBe('Failed');
    expect((await h.eventsOf(run)).at(-1)?.data).toMatchObject({
      errorCode: ERROR_CODES.projectNoSource,
    });
    expect(pipeline.requests).toEqual([]);
  });
});

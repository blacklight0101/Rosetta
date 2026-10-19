import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  createScanRunHarness,
  RecordingPipeline,
  scanActor,
} from '../../../support/scan-run-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';
import {
  fixtureUploads,
  UPLOAD_HASH,
  UPLOAD_KEY,
  UPLOADED_AT,
  uploadProjectFields,
} from '../../../support/upload-run-fixtures.js';

// RF-128, RF-130, RF-131: RunScan on an upload project reads the snapshot of its zip, records the
// zip as the source of the run (no commit) and scans the same tree as for a GitHub source.

const temp = useTempRoot('rosetta-run-scan-upload-');

async function upload(pipeline = new RecordingPipeline()) {
  const h = await createScanRunHarness({
    dataDir: temp.path,
    pipeline,
    project: { ...uploadProjectFields, userId: scanActor.userId },
    uploads: fixtureUploads,
  });
  return { h, pipeline };
}

describe('RunScan an upload project', () => {
  it('RF-130 records the zip, its hash and no commit on the run and in the manifest', async () => {
    const { h } = await upload();

    const run = await h.scan();

    expect(run).toMatchObject({ endState: 'Completed', commitSha: null, snapshotKey: UPLOAD_KEY });
    expect((await h.manifestOf(run)).source).toMatchObject({
      kind: 'upload',
      url: '',
      owner: '',
      repo: '',
      ref: '',
      commitSha: null,
      subpath: '',
      snapshotHash: UPLOAD_HASH,
      fileName: 'OrderDesk.zip',
      uploadedAt: UPLOADED_AT,
    });
  });

  it('RF-131 names the zip in the manifest as soon as the run is accepted', async () => {
    const { h } = await upload();

    const run = await h.start();

    expect((await h.manifestOf(run)).source).toMatchObject({
      kind: 'upload',
      fileName: 'OrderDesk.zip',
      uploadedAt: UPLOADED_AT,
    });
  });

  it('RF-131 run.started carries the zip as its source; no commit event is published', async () => {
    const { h } = await upload();

    const events = await h.eventsOf(await h.scan());

    expect(events.map((event) => event.type)).toEqual([
      'run.started',
      'source.downloaded',
      'scan.completed',
      'run.ended',
    ]);
    expect(events[0]?.data).toMatchObject({
      source: { kind: 'upload', fileName: 'OrderDesk.zip', uploadedAt: UPLOADED_AT },
    });
  });
});

describe('RunScan an upload project: what is scanned', () => {
  it('RF-130 scans the snapshot tree and gives the code map a source with the zip and hash', async () => {
    const { h, pipeline } = await upload();

    await h.scan();

    expect(pipeline.requests[0]?.source).toEqual({
      kind: 'upload',
      fileName: 'OrderDesk.zip',
      snapshotHash: UPLOAD_HASH,
      subpath: '',
    });
    expect(pipeline.requests[0]?.root).toMatch(/webforms-csharp$/u);
  });

  it('RF-122 never asks GitHub for an upload project', async () => {
    const { h } = await upload();

    await h.scan();

    expect(h.fetcher.fetched).toEqual([]);
  });
});

describe('RunScan an upload project whose snapshot is gone', () => {
  it('RF-128 fails with RST-1920 and scans nothing', async () => {
    const pipeline = new RecordingPipeline();
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline,
      project: { ...uploadProjectFields, userId: scanActor.userId },
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

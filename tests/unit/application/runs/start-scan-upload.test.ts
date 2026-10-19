import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  createScanRunHarness,
  RecordingPipeline,
  scanActor,
} from '../../../support/scan-run-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { fixtureUploads, uploadProjectFields } from '../../../support/upload-run-fixtures.js';

// RF-128: a run on an upload project that holds no zip is refused with its code and creates nothing.

const temp = useTempRoot('rosetta-start-scan-upload-');

describe('StartRun on an upload project', () => {
  it('RF-128 refuses a project with no source with RST-1920 and creates no run', async () => {
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline: new RecordingPipeline(),
      project: { ...uploadProjectFields, userId: scanActor.userId, upload: undefined },
      uploads: fixtureUploads,
    });

    const outcome = await h.tryStart();

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.projectNoSource });
    expect(await h.runs.list(scanActor.userId, h.project.id)).toEqual([]);
  });

  it('RF-128 starts a run once the project holds a zip', async () => {
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline: new RecordingPipeline(),
      project: { ...uploadProjectFields, userId: scanActor.userId },
      uploads: fixtureUploads,
    });

    expect((await h.tryStart()).ok).toBe(true);
  });
});

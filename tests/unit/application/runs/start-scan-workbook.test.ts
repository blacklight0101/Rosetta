import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import {
  createScanRunHarness,
  RecordingPipeline,
  scanActor,
} from '../../../support/scan-run-harness.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { fixtureWorkbooks, workbookProjectFields } from '../../../support/workbook-run-fixtures.js';

// RF-150: a run on a workbook project that holds no workbooks is refused with its code and creates nothing.

const temp = useTempRoot('rosetta-start-scan-workbook-');

describe('StartRun on a workbook project', () => {
  it('RF-150 refuses a project with no source with RST-1920 and creates no run', async () => {
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline: new RecordingPipeline(),
      project: { ...workbookProjectFields, userId: scanActor.userId, upload: undefined },
      uploads: fixtureWorkbooks,
    });

    const outcome = await h.tryStart();

    expect(outcome).toEqual({ ok: false, error: ERROR_CODES.projectNoSource });
    expect(await h.runs.list(scanActor.userId, h.project.id)).toEqual([]);
  });

  it('RF-150 starts a run once the project holds workbooks', async () => {
    const h = await createScanRunHarness({
      dataDir: temp.path,
      pipeline: new RecordingPipeline(),
      project: { ...workbookProjectFields, userId: scanActor.userId },
      uploads: fixtureWorkbooks,
    });

    expect((await h.tryStart()).ok).toBe(true);
  });
});

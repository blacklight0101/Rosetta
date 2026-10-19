import { describe, expect, it } from 'vitest';
import { buildReportModel } from '../../../../src/application/report/build-report-model.js';
import { parseRunManifest } from '../../../../src/application/runs/run-manifest-schema.js';
import { recordManifestSource } from '../../../../src/domain/runs/run-manifest.js';
import { plainCoverage, plainCost, plainQuestions } from '../../../support/report-fixtures.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';
import { workbookHash } from '../../../support/upload-source-fixtures.js';

// RF-156, RF-126: the source the report header shows for a run on Excel workbooks comes from the
// manifest of the run: the workbooks, the upload date and the snapshot hash; no repository and no zip.

const workbooks = {
  kind: 'workbook',
  url: '',
  owner: '',
  repo: '',
  ref: '',
  commitSha: null,
  subpath: '',
  snapshotHash: workbookHash,
  uploadedAt: '2026-10-19T09:30:00.000Z',
  rendererVersion: '1',
  workbooks: ['Pricing.xlsx', 'Rates.xlsm'],
} as const;

function modelOf(source: ReturnType<typeof sampleManifest>['source']) {
  return buildReportModel({
    run: sampleRun(),
    manifest: sampleManifest({ source }),
    events: [],
    cardIndex: undefined,
    documents: { spec: false, coverage: false, cost: false },
    areas: [],
    generatedAt: '2026-10-19T10:00:00.000Z',
    coverage: plainCoverage,
    cost: plainCost,
    projectTotals: null,
    questions: plainQuestions,
    cardDetails: [],
  });
}

describe('the manifest of a workbook run', () => {
  it('RF-156 keeps the workbook names when it is read back', () => {
    const stored: unknown = JSON.parse(JSON.stringify(sampleManifest({ source: workbooks })));

    expect(parseRunManifest(stored)?.source).toMatchObject({
      kind: 'workbook',
      workbooks: ['Pricing.xlsx', 'Rates.xlsm'],
    });
  });

  it('RF-156 records the names with the snapshot once it is read', () => {
    const recorded = recordManifestSource(
      sampleManifest({ source: { ...workbooks, workbooks: undefined } }),
      {
        commitSha: null,
        snapshotHash: workbookHash,
        workbooks: ['A.xlsx'],
      },
    );

    expect(recorded.ok && recorded.value.source.workbooks).toEqual(['A.xlsx']);
  });

  it('RF-126 adds no workbook names to the manifest of a GitHub run when it is read back', () => {
    const stored: unknown = JSON.parse(JSON.stringify(sampleManifest()));

    expect(parseRunManifest(stored)?.source).not.toHaveProperty('workbooks');
  });
});

describe('buildReportModel source of a workbook run', () => {
  it('RF-156 names the workbooks, the upload date and the hash, with no zip name', () => {
    expect(modelOf(workbooks).source).toEqual({
      kind: 'workbook',
      fileName: null,
      workbooks: ['Pricing.xlsx', 'Rates.xlsm'],
      uploadedAt: '2026-10-19T09:30:00.000Z',
      snapshotHash: workbookHash,
    });
  });

  it('RF-156 keeps what is not recorded as null and no names as an empty list', () => {
    const { uploadedAt, workbooks: names, ...bare } = workbooks;
    expect(uploadedAt).toBe('2026-10-19T09:30:00.000Z');
    expect(names).toHaveLength(2);

    expect(modelOf({ ...bare, snapshotHash: null }).source).toEqual({
      kind: 'workbook',
      fileName: null,
      workbooks: [],
      uploadedAt: null,
      snapshotHash: null,
    });
  });

  it('RF-131 keeps the model of a zip with workbooks named after the zip', () => {
    const zip = { ...workbooks, kind: 'upload', fileName: 'OrderDesk.zip' } as const;

    expect(modelOf(zip).source).toEqual({
      kind: 'upload',
      fileName: 'OrderDesk.zip',
      uploadedAt: '2026-10-19T09:30:00.000Z',
      snapshotHash: workbookHash,
    });
  });
});

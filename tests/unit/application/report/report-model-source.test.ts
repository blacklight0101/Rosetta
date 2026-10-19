import { describe, expect, it } from 'vitest';
import { buildReportModel } from '../../../../src/application/report/build-report-model.js';
import { parseRunManifest } from '../../../../src/application/runs/run-manifest-schema.js';
import { plainCoverage, plainCost, plainQuestions } from '../../../support/report-fixtures.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';
import { uploadHash } from '../../../support/upload-source-fixtures.js';

// RF-131, RF-504: the source the report header shows comes from the manifest of the run: the
// repository and the commit for a GitHub run, the zip, its upload date and the snapshot hash for an
// upload.

const uploaded = {
  kind: 'upload',
  url: '',
  owner: '',
  repo: '',
  ref: '',
  commitSha: null,
  subpath: '',
  snapshotHash: uploadHash,
  fileName: 'OrderDesk.zip',
  uploadedAt: '2026-10-19T09:30:00.000Z',
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

describe('the manifest of an uploaded run', () => {
  it('RF-131 keeps the zip name and the upload date when it is read back', () => {
    const stored: unknown = JSON.parse(JSON.stringify(sampleManifest({ source: uploaded })));

    expect(parseRunManifest(stored)?.source).toMatchObject({
      fileName: 'OrderDesk.zip',
      uploadedAt: '2026-10-19T09:30:00.000Z',
    });
  });

  it('RF-126 adds neither field to the manifest of a GitHub run when it is read back', () => {
    const stored: unknown = JSON.parse(JSON.stringify(sampleManifest()));

    const source = parseRunManifest(stored)?.source;

    expect(source).not.toHaveProperty('fileName');
    expect(source).not.toHaveProperty('uploadedAt');
  });
});

describe('buildReportModel source', () => {
  it('RF-131 names the zip, the upload date and the hash of an uploaded run', () => {
    expect(modelOf(uploaded).source).toEqual({
      kind: 'upload',
      fileName: 'OrderDesk.zip',
      uploadedAt: '2026-10-19T09:30:00.000Z',
      snapshotHash: uploadHash,
    });
  });

  it('RF-131 keeps what is not recorded as null', () => {
    const { fileName, uploadedAt, ...bare } = uploaded;
    expect(fileName).toBe('OrderDesk.zip');
    expect(uploadedAt).toBe('2026-10-19T09:30:00.000Z');

    expect(modelOf({ ...bare, snapshotHash: null }).source).toEqual({
      kind: 'upload',
      fileName: null,
      uploadedAt: null,
      snapshotHash: null,
    });
  });

  it('RF-504 keeps the repository and the commit of a GitHub run, with no kind', () => {
    const source = modelOf(sampleManifest().source).source;

    expect(source).toEqual({ url: 'https://github.com/owner/repo', commitSha: null });
    expect(source).not.toHaveProperty('kind');
  });
});

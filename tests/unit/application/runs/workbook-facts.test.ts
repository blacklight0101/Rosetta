import { describe, expect, it } from 'vitest';
import { resolvedSourceOf } from '../../../../src/application/plan/resolved-source-of.js';
import { workbookFactsOf } from '../../../../src/application/runs/workbook-facts.js';
import type { ManifestSource } from '../../../../src/domain/runs/manifest-source.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';
import { WORKBOOK_HASH } from '../../../support/workbook-source-fixtures.js';

// RF-156, RF-126, P3-52: what a run on Excel workbooks takes over from the scan it reads, so the
// header of its report and package names the workbooks, the upload instant and the renderer. The
// journey found that the understand and plan runs recorded none of them.

const workbookSource: ManifestSource = {
  kind: 'workbook',
  url: '',
  owner: '',
  repo: '',
  ref: '',
  commitSha: null,
  subpath: '',
  snapshotHash: WORKBOOK_HASH,
  uploadedAt: '2026-10-19T08:00:00.000Z',
  rendererVersion: '1',
  workbooks: ['Pricing.xlsm', 'Discounts.xlsx'],
};

describe('the workbook facts of a source', () => {
  it('RF-156 are the workbook names, the upload instant and the renderer of a workbook source', () => {
    expect(workbookFactsOf(workbookSource)).toEqual({
      workbooks: ['Pricing.xlsm', 'Discounts.xlsx'],
      uploadedAt: '2026-10-19T08:00:00.000Z',
      rendererVersion: '1',
    });
  });

  it('RF-156 are nothing for a zip or a GitHub source, which keep what they recorded before', () => {
    const zip: ManifestSource = {
      ...workbookSource,
      kind: 'upload',
      fileName: 'OrderDesk.zip',
      workbooks: undefined,
      rendererVersion: undefined,
    };
    const github: ManifestSource = { ...zip, kind: undefined, fileName: undefined };

    expect(workbookFactsOf(zip)).toEqual({});
    expect(workbookFactsOf(github)).toEqual({});
  });

  it('RF-156 leave out an upload instant or a renderer the source does not hold', () => {
    const bare: ManifestSource = {
      ...workbookSource,
      uploadedAt: undefined,
      rendererVersion: undefined,
    };

    expect(workbookFactsOf(bare)).toEqual({ workbooks: ['Pricing.xlsm', 'Discounts.xlsx'] });
  });
});

describe('the source a plan run takes from its understand run', () => {
  const understood = sampleRun({
    stage: 'understand',
    snapshotKey: 'workbook__p@0123456789abcdef',
  });

  it('RF-156 names the workbooks of a workbook run', () => {
    const manifest = sampleManifest({ source: workbookSource });

    expect(resolvedSourceOf(understood, manifest)).toEqual({
      commitSha: null,
      snapshotKey: 'workbook__p@0123456789abcdef',
      snapshotHash: WORKBOOK_HASH,
      workbooks: ['Pricing.xlsm', 'Discounts.xlsx'],
      uploadedAt: '2026-10-19T08:00:00.000Z',
      rendererVersion: '1',
    });
  });

  it('RF-131 still names the zip of an upload run and nothing else', () => {
    const zip: ManifestSource = {
      ...workbookSource,
      kind: 'upload',
      fileName: 'OrderDesk.zip',
      workbooks: undefined,
      rendererVersion: undefined,
    };

    expect(resolvedSourceOf(understood, sampleManifest({ source: zip }))).toEqual({
      commitSha: null,
      snapshotKey: 'workbook__p@0123456789abcdef',
      snapshotHash: WORKBOOK_HASH,
      fileName: 'OrderDesk.zip',
      uploadedAt: '2026-10-19T08:00:00.000Z',
    });
  });
});

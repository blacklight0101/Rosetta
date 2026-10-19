import { describe, expect, it } from 'vitest';
import { acceptedManifest } from '../../../../src/application/runs/accepted-manifest.js';
import { parseRunManifest } from '../../../../src/application/runs/run-manifest-schema.js';
import { recordManifestSource } from '../../../../src/domain/runs/run-manifest.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';
import { WORKBOOK_HASH } from '../../../support/workbook-source-fixtures.js';

// RF-126, RF-152, RFC-005 section 4.1: the manifest of a workbook run records the source kind, the
// snapshot hash and the renderer version, and no repository, ref or subpath. A GitHub or an upload
// run records exactly what it recorded before.

function accept(project = workbookProject()) {
  return acceptedManifest({
    run: sampleRun(),
    project,
    rosettaVersion: '1.2.3-test',
    options: {},
  });
}

const workbookProject = () =>
  sampleProject({ name: 'Pricing', sourceKind: 'workbook', sourceUrl: '', ref: '', subpath: '' });

function resolved(manifest = accept()) {
  const recorded = recordManifestSource(manifest, {
    commitSha: null,
    snapshotHash: WORKBOOK_HASH,
    uploadedAt: '2026-10-19T08:00:00.000Z',
    rendererVersion: '1',
  });
  if (!recorded.ok) throw new Error('The manifest had ended');
  return recorded.value;
}

describe('the manifest of a workbook run', () => {
  it('RF-152 records the source kind workbook and no repository, ref or subpath', () => {
    expect(accept().source).toEqual({
      kind: 'workbook',
      url: '',
      owner: '',
      repo: '',
      ref: '',
      commitSha: null,
      subpath: '',
      snapshotHash: null,
    });
  });

  it('RF-126 records the snapshot hash, the upload instant and the renderer version once known', () => {
    expect(resolved().source).toEqual({
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
    });
  });

  it('RF-126 keeps kind, hash and renderer version when the manifest is read back', () => {
    const stored: unknown = JSON.parse(JSON.stringify(resolved()));

    expect(parseRunManifest(stored)?.source).toMatchObject({
      kind: 'workbook',
      commitSha: null,
      snapshotHash: WORKBOOK_HASH,
      rendererVersion: '1',
    });
  });

  it('RF-126 refuses a manifest whose renderer version is not text', () => {
    const manifest = resolved();
    const stored = { ...manifest, source: { ...manifest.source, rendererVersion: 1 } };

    expect(parseRunManifest(stored)).toBeUndefined();
  });
});

describe('the manifest of a GitHub or upload run is as it was', () => {
  it('RF-126 a GitHub run records no renderer version and no upload instant', () => {
    const recorded = recordManifestSource(sampleManifest(), {
      commitSha: 'ab'.repeat(20),
      snapshotHash: WORKBOOK_HASH,
    });

    expect(recorded.ok && JSON.stringify(recorded.value.source)).toBe(
      `{"url":"https://github.com/owner/repo","owner":"owner","repo":"repo","ref":"","commitSha":"${'ab'.repeat(20)}","subpath":"","snapshotHash":"${WORKBOOK_HASH}"}`,
    );
  });

  it('RF-126 an upload run records no renderer version', () => {
    const upload = sampleProject({ sourceKind: 'upload', sourceUrl: '', ref: '', subpath: '' });
    const recorded = recordManifestSource(accept(upload), {
      commitSha: null,
      snapshotHash: WORKBOOK_HASH,
      fileName: 'OrderDesk.zip',
      uploadedAt: '2026-10-19T08:00:00.000Z',
    });

    expect(recorded.ok && recorded.value.source).not.toHaveProperty('rendererVersion');
  });
});

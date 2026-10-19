import { describe, expect, it } from 'vitest';
import { acceptedManifest } from '../../../../src/application/runs/accepted-manifest.js';
import { parseRunManifest } from '../../../../src/application/runs/run-manifest-schema.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';

// RF-126, RF-130, RFC-004 section 4.1: the manifest of a run records the source kind. A GitHub run
// writes exactly the fields it wrote before uploads existed; an upload run adds `kind: upload` and
// leaves the repository fields empty. The snapshot hash is the identity of an upload.

function accept(project = sampleProject()) {
  return acceptedManifest({
    run: sampleRun(),
    project,
    rosettaVersion: '1.2.3-test',
    options: {},
  });
}

const uploadProject = () =>
  sampleProject({ name: 'OrderDesk', sourceKind: 'upload', sourceUrl: '', ref: '', subpath: '' });

describe('the manifest of a GitHub run', () => {
  it('RF-126 has the source fields it had on main, in the same order, and no kind', () => {
    const manifest = accept(
      sampleProject({ sourceUrl: 'https://github.com/octo/demo', ref: 'main', subpath: 'src' }),
    );

    expect(JSON.stringify(manifest.source)).toBe(
      '{"url":"https://github.com/octo/demo","owner":"octo","repo":"demo","ref":"main","commitSha":null,"subpath":"src","snapshotHash":null}',
    );
  });

  it('RF-126 reading a stored GitHub manifest adds no kind to it', () => {
    const stored: unknown = JSON.parse(JSON.stringify(sampleManifest()));

    const read = parseRunManifest(stored);

    expect(read?.source).not.toHaveProperty('kind');
    expect(JSON.stringify(read)).toBe(JSON.stringify(sampleManifest()));
  });

  it('RF-126 a stored manifest that says kind github keeps it', () => {
    const stored = { ...sampleManifest(), source: { ...sampleManifest().source, kind: 'github' } };

    expect(parseRunManifest(stored)?.source).toHaveProperty('kind', 'github');
  });
});

describe('the manifest of an upload run', () => {
  it('RF-130 records the source kind upload and no repository, ref or subpath', () => {
    expect(accept(uploadProject()).source).toEqual({
      kind: 'upload',
      url: '',
      owner: '',
      repo: '',
      ref: '',
      commitSha: null,
      subpath: '',
      snapshotHash: null,
    });
  });

  it('RF-130 keeps the kind and the snapshot hash when the manifest is read back', () => {
    const hash = `sha256:${'b'.repeat(64)}`;
    const manifest = accept(uploadProject());
    const stored: unknown = JSON.parse(
      JSON.stringify({ ...manifest, source: { ...manifest.source, snapshotHash: hash } }),
    );

    expect(parseRunManifest(stored)?.source).toMatchObject({
      kind: 'upload',
      commitSha: null,
      snapshotHash: hash,
    });
  });

  it('RF-130 refuses a manifest whose source kind is not one of the two', () => {
    const stored = { ...sampleManifest(), source: { ...sampleManifest().source, kind: 'folder' } };

    expect(parseRunManifest(stored)).toBeUndefined();
  });
});

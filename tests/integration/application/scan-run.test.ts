import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCodeMap } from '../../../src/infrastructure/scan/codemap/codemap-json.js';
import { createScanRunHarness, FAKE_COMMIT, scanActor } from '../../support/scan-run-harness.js';
import { fixtureRoot } from '../../support/scan-harness.js';
import { hashTree } from '../../support/snapshot-fixture.js';
import { useTempRoot } from '../../support/temp-root.js';

// RF-003, RF-005, RF-100, RF-126: a scan run on the C# fixture repository with the real scan, the
// real language pack and the real writers; only the source is the fixture folder instead of a
// download.

const temp = useTempRoot('rosetta-scan-run-');

function runFolder(projectId: string, runKey: string): string {
  return join(temp.path, 'users', scanActor.userId, 'projects', projectId, 'runs', runKey);
}

describe('a scan run on the C# fixture: outputs', () => {
  it('RF-105 writes a valid code map and the scan summary into the run folder', async () => {
    const h = await createScanRunHarness({ dataDir: temp.path });

    const run = await h.scan();

    expect(run.endState).toBe('Completed');
    const folder = runFolder(run.projectId, run.runKey);
    const parsed = parseCodeMap(await readFile(join(folder, 'codemap.json'), 'utf8'));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.source).toMatchObject({
      owner: 'octo',
      repo: 'demo',
      commitSha: FAKE_COMMIT,
    });
    expect(parsed.value.files.length).toBeGreaterThan(5);
    expect(parsed.value.languagePacks.map((pack) => pack.name)).toContain('csharp');
    expect(await readFile(join(folder, 'scan-summary.md'), 'utf8')).toContain('octo/demo');
  });

  it('RF-126 the manifest holds the URL, ref, commit, subpath, snapshot hash and code map hash', async () => {
    const h = await createScanRunHarness({ dataDir: temp.path });

    const run = await h.scan();
    const manifest = await h.manifestOf(run);

    expect(manifest.source).toMatchObject({
      url: 'https://github.com/octo/demo',
      ref: '',
      commitSha: FAKE_COMMIT,
      subpath: '',
    });
    expect(manifest.source.snapshotHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    const bytes = await readFile(join(runFolder(run.projectId, run.runKey), 'codemap.json'));
    const { createHash } = await import('node:crypto');
    expect(manifest.codemapHash).toBe(createHash('sha256').update(bytes).digest('hex'));
    expect(manifest.endState).toBe('Completed');
  });
});

describe('a scan run on the C# fixture: snapshot and subpath', () => {
  it('RF-005 leaves the snapshot unchanged and writes only inside the user workspace', async () => {
    const before = await hashTree(fixtureRoot('webforms-csharp'));
    const h = await createScanRunHarness({ dataDir: temp.path });

    await h.scan();

    expect(await hashTree(fixtureRoot('webforms-csharp'))).toBe(before);
    expect(await readdir(temp.path)).toEqual(['users']);
  });

  it('RF-124 limits the code map to the subpath of the project, with paths from the repository root', async () => {
    const h = await createScanRunHarness({ dataDir: temp.path, project: { subpath: 'Catalog' } });

    const run = await h.scan();

    const parsed = parseCodeMap(
      await readFile(join(runFolder(run.projectId, run.runKey), 'codemap.json'), 'utf8'),
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.source.subpath).toBe('Catalog');
    expect(parsed.value.files.length).toBeGreaterThan(0);
    expect(parsed.value.files.every((file) => file.path.startsWith('Catalog/'))).toBe(true);
  });
});

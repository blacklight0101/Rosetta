import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { completedRun, deepenOf } from '../../support/deepen-run.js';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import {
  createUnderstandHarness,
  understandSettings,
  type UnderstandHarness,
} from '../../support/understand-run-harness.js';
import { UPLOAD_HASH } from '../../support/upload-run-fixtures.js';

// RF-130, RF-209, RF-006, P3-42: a Deepen and a Resume on a project of kind `upload`, with the fake
// provider, read the snapshot of the zip exactly as for a GitHub project: the run keeps the zip, its
// hash and no commit, and nothing it writes names GitHub (RF-131).

const temp = useTempRoot('rosetta-upload-deepen-resume-');

/** Every text file below a folder, by its path inside it. */
async function textFilesBelow(folder: string): Promise<ReadonlyMap<string, string>> {
  const found = new Map<string, string>();
  for (const entry of await readdir(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const path = join(entry.parentPath, entry.name);
    found.set(path, await readFile(path, 'utf8'));
  }
  return found;
}

async function expectNothingNamesGithub(
  h: UnderstandHarness,
  run: Parameters<UnderstandHarness['runFolder']>[0],
) {
  for (const [path, text] of await textFilesBelow(h.runFolder(run))) {
    expect(text, `${path} names GitHub`).not.toContain('github.com');
  }
}

describe('RF-209 a Deepen on an uploaded zip', UNDERSTAND_TIMEOUT, () => {
  it('RF-209 RF-130 deepens a completed run of the zip, keeping its hash and no commit', async () => {
    const { h, run } = await completedRun({
      dataDir: temp.path,
      upload: true,
      recording: 'deepen-no-progress.json',
      verifierRecording: 'verifier-deepen-no-progress.json',
    });

    const deepen = await h.deepen(run, { coveragePass: false });

    if (!deepen.ok) throw new Error(deepen.error);
    expect(deepen.value.commitSha).toBeNull();
    expect((await h.manifestOf(deepen.value)).source).toMatchObject({
      kind: 'upload',
      snapshotHash: UPLOAD_HASH,
      fileName: 'OrderDesk.zip',
    });
    expect(await deepenOf(h, deepen.value)).toMatchObject({ parentRunId: run.id });
    await expectNothingNamesGithub(h, deepen.value);
  });
});

describe('RF-006 a Resume on an uploaded zip', UNDERSTAND_TIMEOUT, () => {
  it('RF-006 RF-130 resumes a capped run of the zip in its own folder, with the same hash', async () => {
    const h = await createUnderstandHarness({
      dataDir: temp.path,
      upload: true,
      recording: 'understand-resume.json',
      verifierRecording: 'verifier-all-supported.json',
      settings: understandSettings((settings) => ({
        ...settings,
        budget: { ...settings.budget, run: { maxCostMicros: 500_000, maxTokens: 205_000 } },
      })),
    });
    await h.scan();
    const run = await h.understand({ areas: ['Catalog', 'Services'] });
    expect(run.endState).toBe('CapReached');
    await h.changeSettings((settings) => ({
      ...settings,
      budget: { ...settings.budget, run: { maxCostMicros: 50_000_000, maxTokens: 5_000_000 } },
    }));

    const resumed = await h.resume(run);

    if (!resumed.ok) throw new Error(resumed.error);
    expect(resumed.value).toMatchObject({ id: run.id, endState: 'Completed', commitSha: null });
    expect((await h.manifestOf(run)).source).toMatchObject({
      kind: 'upload',
      snapshotHash: UPLOAD_HASH,
    });
    await expectNothingNamesGithub(h, run);
  });
});

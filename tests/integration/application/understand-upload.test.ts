import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { useTempRoot } from '../../support/temp-root.js';
import { UNDERSTAND_TIMEOUT } from '../../support/understand-full-run.js';
import { createUnderstandHarness } from '../../support/understand-run-harness.js';
import { UPLOAD_HASH, UPLOADED_AT } from '../../support/upload-run-fixtures.js';

// RF-130, RF-131: an understand run on an uploaded zip, with the fake provider, on the same fixture
// tree as a GitHub run. Its cards link their citations to the evidence pages of the report, and the
// manifest names the zip instead of a commit.

const temp = useTempRoot('rosetta-understand-upload-');

async function uploadRun() {
  const h = await createUnderstandHarness({
    dataDir: temp.path,
    recording: 'understand-csharp-full.json',
    verifierRecording: 'verifier-csharp-full.json',
    upload: true,
  });
  await h.scan();
  const run = await h.understand();
  return { h, run };
}

describe('an understand run on an uploaded zip', UNDERSTAND_TIMEOUT, () => {
  it('RF-130 completes, names the zip in its manifest and has no commit', async () => {
    const { h, run } = await uploadRun();

    expect(run.endState).toBe('Completed');
    expect(run.commitSha).toBeNull();
    expect((await h.manifestOf(run)).source).toMatchObject({
      kind: 'upload',
      commitSha: null,
      snapshotHash: UPLOAD_HASH,
      fileName: 'OrderDesk.zip',
      uploadedAt: UPLOADED_AT,
    });
  });

  it('RF-131 links the citations of its cards to the report, never to GitHub', async () => {
    const { h, run } = await uploadRun();

    const spec = await readFile(join(h.runFolder(run), 'spec.md'), 'utf8');
    expect(spec).not.toContain('github.com');
    expect(spec).toContain('report/card-');
  });
});

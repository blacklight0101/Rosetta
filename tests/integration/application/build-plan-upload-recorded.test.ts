import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadRecording } from '../../../src/infrastructure/providers/fake/recording.js';
import { planCards, planQuestions } from '../../support/plan-cards.js';
import { createPlanHarness } from '../../support/plan-harness.js';

// RF-130, RF-131, RNF-004: a plan run over an understand run of an uploaded zip records that zip as
// its own source: no commit, the snapshot it read, the hash, the name and the instant of the zip.

const upload = { fileName: 'OrderDesk.zip', uploadedAt: '2026-10-19T09:30:00.000Z' };
const hash = `sha256:${'cd'.repeat(32)}`;
const brief = {
  architecture: { style: 'hexagonal' },
  migration: 'parallel-change',
  stack: [{ layer: 'database', choice: 'PostgreSQL', custom: false }],
} as const;

let dataDir: string;

beforeEach(async () => {
  dataDir = await mkdtemp(join(tmpdir(), 'rosetta-plan-upload-recorded-'));
});

afterEach(async () => {
  await rm(dataDir, { recursive: true, force: true });
});

async function planOverUpload() {
  const recording = await loadRecording(
    join('tests', 'recordings', 'fake', 'planner-package.json'),
  );
  const h = await createPlanHarness(dataDir, recording, {
    project: { sourceKind: 'upload', sourceUrl: '', ref: '', subpath: '' },
  });
  const source = await h.understandRun({ cards: planCards(), questions: planQuestions, upload });
  await h.saveBrief(brief);
  const run = await h.plan();
  return { h, source, run };
}

describe('BuildPlan over the run of an uploaded zip', () => {
  it('RF-130 records the snapshot of the source run on the run row, with no commit', async () => {
    const { source, run } = await planOverUpload();

    expect(run.endState).toBe('Completed');
    expect(run.commitSha).toBeNull();
    expect(run.snapshotKey).toBe(source.snapshotKey);
  });

  it('RF-131 records the zip, its instant and its hash in the manifest of the plan run', async () => {
    const { h, run } = await planOverUpload();

    expect((await h.manifestOf(run)).source).toMatchObject({
      kind: 'upload',
      commitSha: null,
      snapshotHash: hash,
      ...upload,
    });
  });
});

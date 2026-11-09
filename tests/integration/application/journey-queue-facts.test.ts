import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { StartRun } from '../../../src/application/use-cases/start-run.js';
import { MemoryProjectRepository } from '../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryRunManifestStore } from '../../../src/infrastructure/files/memory-run-manifest-store.js';
import { completedRun } from '../../support/deepen-run.js';
import { noJourney } from '../../support/journey-lookups.js';
import { MemoryBriefStore } from '../../support/memory-brief-store.js';
import { sampleProject } from '../../support/project-fixtures.js';
import { settingsFor } from '../../support/provider-factory-harness.js';
import { sampleRun } from '../../support/run-fixtures.js';
import { createRunHarness, userAmy } from '../../support/run-harness.js';
import { ALL_KEYS_SERVED } from '../../support/web-role-keys.js';

// P8-139, RF-1108, DEC-226: a Deepen and a plan run that names its source keep the run they come
// from on their row from the moment they are queued, so the journey places them without a manifest.

const dirs: string[] = [];

afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('the run a queued run comes from', () => {
  it('RF-1108 DEC-226 a queued Deepen records the run it improves on its row', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'rosetta-p8139-'));
    dirs.push(dir);
    const { h, run } = await completedRun({
      dataDir: dir,
      recording: 'deepen-answers-only.json',
      verifierRecording: 'verifier-deepen-answers-only.json',
    });

    const started = await h.deepen(run, { coveragePass: false, maxRounds: 1 });

    expect(started.ok && started.value.deepenParentId).toBe(run.id);
  });

  it('RF-1108 RF-614 DEC-226 a plan run queued from a named source records its folder name', async () => {
    const harness = createRunHarness();
    const briefs = new MemoryBriefStore();
    const projects = new MemoryProjectRepository();
    const settings = settingsFor({ planner: { provider: 'fake', model: 'fake-model' } });
    const project = sampleProject({ userId: userAmy.userId, settings });
    await projects.insertOrFind(project);
    await briefs.saveEmpty({ userId: project.userId, projectId: project.id });
    const source = sampleRun({
      ...{ userId: userAmy.userId, projectId: project.id, stage: 'understand' },
      ...{ runKey: '20261010-090000-understand', queueState: 'Ended', endState: 'Completed' },
    });
    await harness.runs.insert(source);
    const startRun = new StartRun({
      ...{ manifests: new MemoryRunManifestStore(), journey: noJourney },
      ...{ roleKeys: ALL_KEYS_SERVED, projects, runs: harness.runs, briefs },
      submit: harness.submit,
    });

    const started = await startRun.execute({
      ...{ actor: userAmy, projectId: project.id, stage: 'plan' },
      sourceRunId: source.id,
    });

    expect(started.ok && started.value.run.planSourceKey).toBe(source.runKey);
  });
});

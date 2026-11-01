import { ALL_KEYS_SERVED } from '../../../support/web-role-keys.js';
import { describe, expect, it } from 'vitest';
import { StartRun } from '../../../../src/application/use-cases/start-run.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { MemoryBriefStore } from '../../../support/memory-brief-store.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';
import { sampleRun } from '../../../support/run-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';

// RF-614, RST-1802, RF-1105: Plan setup starts `plan` from a chosen understand run. The run must be
// the user's, of this project, an understand run that ended Completed or CapReached; the manifest records it.

const fakePlanner = settingsFor({ planner: { provider: 'fake', model: 'fake-model' } });

async function setup() {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const briefs = new MemoryBriefStore();
  const project = sampleProject({ userId: userAmy.userId, settings: fakePlanner });
  await projects.insertOrFind(project);
  await briefs.saveEmpty({ userId: project.userId, projectId: project.id });
  const startRun = new StartRun({
    roleKeys: ALL_KEYS_SERVED,
    projects,
    runs: harness.runs,
    briefs,
    submit: harness.submit,
  });
  const seed = async (overrides: Partial<Run>): Promise<Run> => {
    const run = sampleRun({
      ...{ userId: project.userId, projectId: project.id, stage: 'understand' },
      ...{ queueState: 'Ended', endState: 'Completed', ...overrides },
    });
    await harness.runs.insert(run);
    return run;
  };
  return { harness, project, startRun, seed };
}

describe('StartRun for plan: the source run', () => {
  it('RF-614 records the chosen run in the manifest options', async () => {
    const { harness, project, startRun, seed } = await setup();
    const source = await seed({});

    const started = await startRun.execute({
      ...{ actor: userAmy, projectId: project.id, stage: 'plan', sourceRunId: source.id },
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(manifest?.options).toEqual({ cloudConsent: false, sourceRunId: source.id });
  });
});

describe('StartRun for plan: a source run that stopped', () => {
  it('RF-614 P3-121 accepts a source run that ended CapReached', async () => {
    const { harness, project, startRun, seed } = await setup();
    const source = await seed({ endState: 'CapReached' });

    const started = await startRun.execute({
      ...{ actor: userAmy, projectId: project.id, stage: 'plan', sourceRunId: source.id },
    });

    expect(started.ok).toBe(true);
    expect(await harness.runs.list(userAmy.userId, project.id)).toHaveLength(2);
  });

  it.each(['Failed', 'Interrupted'] as const)(
    'RST-1802 refuses a source run that ended %s, creating no plan run',
    async (endState) => {
      const { harness, project, startRun, seed } = await setup();
      const source = await seed({ endState });
      const before = (await harness.runs.list(userAmy.userId, project.id)).length;

      const started = await startRun.execute({
        ...{ actor: userAmy, projectId: project.id, stage: 'plan', sourceRunId: source.id },
      });

      expect(started).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
      expect(await harness.runs.list(userAmy.userId, project.id)).toHaveLength(before);
    },
  );

  it('RST-1802 refuses a source run that is not an understand run', async () => {
    const { project, startRun, seed } = await setup();
    const scan = await seed({ stage: 'scan' });

    const started = await startRun.execute({
      ...{ actor: userAmy, projectId: project.id, stage: 'plan', sourceRunId: scan.id },
    });

    expect(started).toEqual({ ok: false, error: ERROR_CODES.planSourceMissing });
  });
});

describe('StartRun for plan: a source run that did not complete', () => {
  it('RF-1105 an unknown run id is not found, creating no plan run', async () => {
    const { harness, project, startRun } = await setup();

    const started = await startRun.execute({
      ...{ actor: userAmy, projectId: project.id, stage: 'plan', sourceRunId: sampleRun().id },
    });

    expect(started).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(harness.executor.started).toHaveLength(0);
  });

  it("RF-1105 another user's run id is not found", async () => {
    const { project, startRun, seed } = await setup();
    const theirs = await seed({ userId: userBob.userId });

    const started = await startRun.execute({
      ...{ actor: userAmy, projectId: project.id, stage: 'plan', sourceRunId: theirs.id },
    });

    expect(started).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });

  it('RF-1105 a run of another project of the same user is not found', async () => {
    const { project, startRun, seed } = await setup();
    const elsewhere = await seed({ projectId: '00000000-0000-4000-a000-0000000000ff' });

    const started = await startRun.execute({
      ...{ actor: userAmy, projectId: project.id, stage: 'plan', sourceRunId: elsewhere.id },
    });

    expect(started).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});

describe('StartRun for plan: who and what a source run applies to', () => {
  it('RF-614 a source run is ignored by the other stages', async () => {
    const { harness, project, startRun, seed } = await setup();
    const source = await seed({});

    const started = await startRun.execute({
      ...{ actor: userAmy, projectId: project.id, stage: 'scan', sourceRunId: source.id },
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(manifest?.options).not.toHaveProperty('sourceRunId');
  });
});

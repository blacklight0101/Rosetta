import { MemoryRunManifestStore } from '../../../../src/infrastructure/files/memory-run-manifest-store.js';
import { noJourney } from '../../../support/journey-lookups.js';
import { ALL_KEYS_SERVED } from '../../../support/web-role-keys.js';
import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { StartRun } from '../../../../src/application/use-cases/start-run.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { MemoryBriefStore } from '../../../support/memory-brief-store.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';

// RF-604, RF-605, RF-143: Plan setup starts the `plan` stage through StartRun. The planner is the
// only role of a plan run, so only it needs the consent to send code to a cloud provider; the
// consent is recorded in the manifest, where the executor reads it back. A refusal creates no run.

async function setup(settings: ProjectSettings, options: { readonly brief?: boolean } = {}) {
  const harness = createRunHarness();
  const briefs = new MemoryBriefStore();
  const projects = new MemoryProjectRepository();
  const project = sampleProject({ userId: userAmy.userId, settings });
  await projects.insertOrFind(project);
  if (options.brief !== false)
    await briefs.saveEmpty({ userId: project.userId, projectId: project.id });
  const startRun = new StartRun({
    manifests: new MemoryRunManifestStore(),
    journey: noJourney,
    roleKeys: ALL_KEYS_SERVED,
    projects,
    runs: harness.runs,
    briefs,
    submit: harness.submit,
  });
  return { harness, project, startRun };
}

const fakePlanner = settingsFor({ planner: { provider: 'fake', model: 'fake-model' } });
const cloudPlanner = settingsFor({ planner: { provider: 'openai', model: 'gpt-5-mini' } });
const cloudSummariser = settingsFor({
  planner: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
});

describe('StartRun for plan', () => {
  it('RF-604 accepts a plan run and records the consent, and only the consent, in the manifest', async () => {
    const { harness, project, startRun } = await setup(fakePlanner);

    const started = await startRun.execute({
      actor: userAmy,
      projectId: project.id,
      stage: 'plan',
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(manifest?.stage).toBe('plan');
    expect(manifest?.options).toEqual({ cloudConsent: false });
  });

  it('RF-143 refuses a plan run whose planner is a cloud provider without the consent, creating no run', async () => {
    const { harness, project, startRun } = await setup(cloudPlanner);

    const started = await startRun.execute({
      actor: userAmy,
      projectId: project.id,
      stage: 'plan',
    });

    expect(started).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
    expect(await harness.runs.list(userAmy.userId, project.id)).toEqual([]);
    expect(harness.executor.started).toHaveLength(0);
  });

  it('RF-143 accepts the cloud plan run with the consent and records it', async () => {
    const { harness, project, startRun } = await setup(cloudPlanner);

    const started = await startRun.execute({
      actor: userAmy,
      projectId: project.id,
      stage: 'plan',
      cloudConsent: true,
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(manifest?.options).toEqual({ cloudConsent: true });
  });
});

describe('StartRun for plan: the saved brief', () => {
  it('RST-1801 refuses a plan run of a project with no saved brief, creating no run', async () => {
    const { harness, project, startRun } = await setup(fakePlanner, { brief: false });

    const started = await startRun.execute({
      actor: userAmy,
      projectId: project.id,
      stage: 'plan',
    });

    expect(started).toEqual({ ok: false, error: ERROR_CODES.planBriefMissing });
    expect(await harness.runs.list(userAmy.userId, project.id)).toEqual([]);
    expect(harness.executor.started).toHaveLength(0);
  });

  it('RST-1801 asks for the brief before the consent: the owner fixes the brief first', async () => {
    const { project, startRun } = await setup(cloudPlanner, { brief: false });

    const started = await startRun.execute({
      actor: userAmy,
      projectId: project.id,
      stage: 'plan',
    });

    expect(started).toEqual({ ok: false, error: ERROR_CODES.planBriefMissing });
  });
});

describe('StartRun for plan: whose consent and which project', () => {
  it('RF-143 a cloud summariser does not matter to a plan run: only the planner is called', async () => {
    const { project, startRun } = await setup(cloudSummariser);

    const started = await startRun.execute({
      actor: userAmy,
      projectId: project.id,
      stage: 'plan',
    });

    expect(started.ok).toBe(true);
  });

  it("RF-1105 another user's project is not found", async () => {
    const { project, startRun } = await setup(fakePlanner);
    const stranger = { userId: '00000000-0000-4000-9000-0000000000ff', role: 'user' } as const;

    const started = await startRun.execute({
      actor: stranger,
      projectId: project.id,
      stage: 'plan',
    });

    expect(started).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });
});

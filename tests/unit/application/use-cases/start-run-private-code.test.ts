import { heldZip } from '../../../support/upload-run-fixtures.js';
import { describe, expect, it } from 'vitest';
import { MemoryBriefStore } from '../../../support/memory-brief-store.js';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { StartRun } from '../../../../src/application/use-cases/start-run.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { SourceKind } from '../../../../src/domain/sources/source-kind.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';

// RF-132, RF-143, DEC-118, DEC-148: StartRun asks a second confirmation, separate from the cloud
// consent, when a project of kind `upload` has a role on a non-local provider, and refuses a start
// without it before any run exists. A GitHub project and an all-local upload ask nothing more.

async function setup(settings: ProjectSettings, kind: SourceKind = 'upload', ollamaHost?: string) {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const project =
    kind === 'upload'
      ? sampleProject({
          userId: userAmy.userId,
          settings,
          sourceKind: 'upload',
          sourceUrl: '',
          upload: heldZip,
        })
      : sampleProject({ userId: userAmy.userId, settings });
  await projects.insertOrFind(project);
  const briefs = new MemoryBriefStore();
  await briefs.saveEmpty({ userId: project.userId, projectId: project.id });
  const startRun = new StartRun({
    projects,
    runs: harness.runs,
    briefs,
    submit: harness.submit,
    ...(ollamaHost === undefined ? {} : { ollamaHost }),
  });
  return { harness, project, startRun };
}

const allFake = settingsFor({
  reader: { provider: 'fake', model: 'fake-model' },
  verifier: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
});
const oneCloud = settingsFor({
  reader: { provider: 'fake', model: 'fake-model' },
  verifier: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
});
const everyCloud = settingsFor({
  reader: { provider: 'openai', model: 'gpt-5-mini' },
  verifier: { provider: 'openai', model: 'gpt-5-mini' },
  summariser: { provider: 'anthropic', model: 'claude-sonnet-4-5' },
});
const ollamaOnly = settingsFor({
  reader: { provider: 'ollama', model: 'gemma4:e4b' },
  verifier: { provider: 'ollama', model: 'gemma4:e4b' },
  summariser: { provider: 'ollama', model: 'gemma4:e4b' },
});

const understand = (projectId: string) =>
  ({ actor: userAmy, projectId, stage: 'understand' }) as const;
const refused = { ok: false, error: ERROR_CODES.privateCodeNotConfirmed };

describe('StartRun and private code (RF-132)', () => {
  it('RF-132 an upload whose roles are all local asks neither confirmation', async () => {
    const { project, startRun } = await setup(allFake);

    const started = await startRun.execute(understand(project.id));

    expect(started.ok).toBe(true);
  });

  it('RF-132 an upload with one cloud role is refused without the second confirmation, creating no run', async () => {
    const { harness, project, startRun } = await setup(oneCloud);

    const started = await startRun.execute({ ...understand(project.id), cloudConsent: true });

    expect(started).toEqual(refused);
    expect(await harness.runs.list(userAmy.userId, project.id)).toEqual([]);
    expect(harness.executor.started).toHaveLength(0);
  });

  it('RF-132 an upload with one cloud role starts when both confirmations are given', async () => {
    const { harness, project, startRun } = await setup(oneCloud);

    const started = await startRun.execute({
      ...understand(project.id),
      cloudConsent: true,
      privateCodeConfirmed: true,
    });

    expect(started.ok).toBe(true);
    expect(await harness.runs.list(userAmy.userId, project.id)).toHaveLength(1);
  });

  it('RF-132 an upload with every role in the cloud is refused without the second confirmation', async () => {
    const { project, startRun } = await setup(everyCloud);

    const started = await startRun.execute({ ...understand(project.id), cloudConsent: true });

    expect(started).toEqual(refused);
  });
});

describe('StartRun and the second confirmation as sent (RF-132, RF-143)', () => {
  it('RF-132 a second confirmation that is false is a missing one', async () => {
    const { project, startRun } = await setup(oneCloud);

    const started = await startRun.execute({
      ...understand(project.id),
      cloudConsent: true,
      privateCodeConfirmed: false,
    });

    expect(started).toEqual(refused);
  });

  it('RF-132 RF-143 without the cloud consent the refusal is still RST-1515', async () => {
    const { project, startRun } = await setup(oneCloud);

    const started = await startRun.execute({
      ...understand(project.id),
      privateCodeConfirmed: true,
    });
    const neither = await startRun.execute(understand(project.id));

    expect(started).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
    expect(neither).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
  });
});

describe('StartRun and the host of Ollama (RF-132, DEC-118)', () => {
  it('RF-132 DEC-118 an upload on an Ollama server of another host needs the second confirmation', async () => {
    const { project, startRun } = await setup(ollamaOnly, 'upload', 'gpu.example.net');

    const without = await startRun.execute({ ...understand(project.id), cloudConsent: true });
    const given = await startRun.execute({
      ...understand(project.id),
      cloudConsent: true,
      privateCodeConfirmed: true,
    });

    expect(without).toEqual(refused);
    expect(given.ok).toBe(true);
  });

  it.each(['localhost', '127.0.0.1', 'host.docker.internal'])(
    'RF-132 DEC-118 an upload on an Ollama server at %s counts as local and asks nothing',
    async (host) => {
      const { project, startRun } = await setup(ollamaOnly, 'upload', host);

      const started = await startRun.execute(understand(project.id));

      expect(started.ok).toBe(true);
    },
  );
});

describe('StartRun where no second confirmation is asked (RF-132)', () => {
  it('RF-132 a GitHub project with a cloud role needs only the cloud consent', async () => {
    const { project, startRun } = await setup(everyCloud, 'github');

    const started = await startRun.execute({ ...understand(project.id), cloudConsent: true });

    expect(started.ok).toBe(true);
  });

  it('RF-132 a scan run of an upload with cloud roles asks nothing: no model is called', async () => {
    const { project, startRun } = await setup(everyCloud);

    const started = await startRun.execute({
      actor: userAmy,
      projectId: project.id,
      stage: 'scan',
    });

    expect(started.ok).toBe(true);
  });
});

describe('StartRun records the second confirmation of a plan run (RF-132, DEC-151)', () => {
  const plan = (projectId: string) => ({ actor: userAmy, projectId, stage: 'plan' }) as const;
  const cloudPlanner = settingsFor({ planner: { provider: 'openai', model: 'gpt-5-mini' } });

  it('RF-132 a plan run that needed the confirmation records it, so the queue can check it again', async () => {
    const { harness, project, startRun } = await setup(cloudPlanner);

    const started = await startRun.execute({
      ...plan(project.id),
      cloudConsent: true,
      privateCodeConfirmed: true,
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(manifest?.options['privateCodeConfirmed']).toBe(true);
  });

  it('RF-132 a plan run that needed no confirmation records none', async () => {
    const { harness, project, startRun } = await setup(allFake);

    const started = await startRun.execute(plan(project.id));

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(manifest?.options).toEqual({ cloudConsent: false });
  });
});

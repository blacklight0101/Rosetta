import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import { StartRun } from '../../../../src/application/use-cases/start-run.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';

// RF-200, RF-143, RF-003: StartRun accepts an understand run with its areas and the consent, and
// refuses a run whose reader would send code off this machine without the consent, before any run
// exists and before any call.

async function setup(settings: ProjectSettings, ollamaHost?: string) {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const project = sampleProject({ userId: userAmy.userId, settings });
  await projects.insertOrFind(project);
  const startRun = new StartRun({
    projects,
    submit: harness.submit,
    ...(ollamaHost === undefined ? {} : { ollamaHost }),
  });
  return { harness, project, startRun };
}

const fakeReader = settingsFor({ reader: { provider: 'fake', model: 'fake-model' } });
const cloudReader = settingsFor({ reader: { provider: 'openai', model: 'gpt-5-mini' } });
const ollamaReader = settingsFor({ reader: { provider: 'ollama', model: 'gemma4:e4b' } });

describe('StartRun for understand', () => {
  it('RF-200 accepts an understand run and records the named areas and the consent in the manifest', async () => {
    const { harness, project, startRun } = await setup(fakeReader);

    const started = await startRun.execute({
      actor: userAmy,
      projectId: project.id,
      stage: 'understand',
      areas: ['Catalog', 'Services'],
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(manifest?.stage).toBe('understand');
    expect(manifest?.options).toEqual({ areas: ['Catalog', 'Services'], cloudConsent: false });
  });
});

describe('StartRun and the cloud consent (RF-143)', () => {
  it('RF-143 refuses an understand run whose reader is a cloud provider without the consent, creating no run', async () => {
    const { harness, project, startRun } = await setup(cloudReader);

    const started = await startRun.execute({
      actor: userAmy,
      projectId: project.id,
      stage: 'understand',
    });

    expect(started).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
    expect(await harness.runs.list(userAmy.userId, project.id)).toEqual([]);
    expect(harness.executor.started).toHaveLength(0);
  });

  it('RF-143 accepts the cloud run with the consent and records it', async () => {
    const { harness, project, startRun } = await setup(cloudReader);

    const started = await startRun.execute({
      actor: userAmy,
      projectId: project.id,
      stage: 'understand',
      cloudConsent: true,
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(manifest?.options).toEqual({ cloudConsent: true });
  });
});

describe('StartRun and the host of Ollama', () => {
  it('RF-143 an Ollama reader on this machine needs no consent; one on another host does', async () => {
    const local = await setup(ollamaReader, '127.0.0.1');
    const remote = await setup(ollamaReader, 'gpu.example.net');
    const request = { actor: userAmy, stage: 'understand' } as const;

    const atHome = await local.startRun.execute({ ...request, projectId: local.project.id });
    const away = await remote.startRun.execute({ ...request, projectId: remote.project.id });

    expect(atHome.ok).toBe(true);
    expect(away).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
  });

  it('RF-003 a scan run still records only its scan settings', async () => {
    const { harness, project, startRun } = await setup(cloudReader);

    const started = await startRun.execute({
      actor: userAmy,
      projectId: project.id,
      stage: 'scan',
    });

    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const manifest = await harness.manifests.read(harness.scopeOf(started.value.run));
    expect(Object.keys(manifest?.options ?? {})).toEqual(['scanSettings']);
  });
});

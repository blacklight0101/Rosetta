import { describe, expect, it } from 'vitest';
import type { ProjectSettings } from '../../../../src/application/projects/project-settings.js';
import type { RunManifestStore } from '../../../../src/application/ports/run-manifest-store.js';
import { ResumeRun } from '../../../../src/application/use-cases/resume-run.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { RunEndState, RunStage } from '../../../../src/domain/runs/run-states.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { MemoryProjectRepository } from '../../../../src/infrastructure/db/memory-project-repository.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';

// RF-006, RF-1105, RF-143, ADR-007: Resume run queues the user's ended understand run again, in
// the same run folder and manifest, with the caps now in force. Another user's run, a stage with
// no tasks, a run that completed and a run already queued again are refused; so is a resume that
// would send code to a cloud provider the run had no consent for.

const fakeReader = settingsFor({ reader: { provider: 'fake', model: 'fake-model' } });
const cloudReader = settingsFor({ reader: { provider: 'openai', model: 'gpt-5-mini' } });

async function setup(settings: ProjectSettings = fakeReader) {
  const harness = createRunHarness();
  const projects = new MemoryProjectRepository();
  const project = sampleProject({ userId: userAmy.userId, settings });
  await projects.insertOrFind(project);
  const resume = (manifests: RunManifestStore = harness.manifests) =>
    new ResumeRun({
      projects,
      runs: harness.runs,
      manifests,
      queue: harness.queue,
      clock: harness.clock,
    });

  async function ended(
    endState: RunEndState,
    options: { stage?: RunStage; cloudConsent?: boolean } = {},
  ): Promise<Run> {
    const stage = options.stage ?? 'understand';
    const submitted = await harness.submit.execute({
      actor: userAmy,
      project,
      stage,
      options: { cloudConsent: options.cloudConsent ?? false },
    });
    if (!submitted.ok) throw new Error('The run was not accepted');
    const { run } = submitted.value;
    await Promise.resolve();
    harness.executor.settle(run.id, { endState });
    return harness.ended(run);
  }

  return { harness, projects, project, resume, ended };
}

const as = (actor: Actor, runId: string) => ({ actor, runId });

describe('ResumeRun', () => {
  it.each(['CapReached', 'Failed', 'Interrupted'] as const)(
    'RF-006 queues the same run again when it ended %s, and it starts',
    async (endState) => {
      const { harness, resume, ended } = await setup();
      const run = await ended(endState);

      const resumed = await resume().execute(as(userAmy, run.id));

      expect(resumed.ok).toBe(true);
      if (!resumed.ok) return;
      expect(resumed.value.run).toMatchObject({ id: run.id, runKey: run.runKey });
      expect(harness.executor.startedKeys).toEqual([run.runKey, run.runKey]);
    },
  );

  it('RF-006 writes the caps now in force into the manifest and clears its end', async () => {
    const { harness, projects, project, resume, ended } = await setup();
    const run = await ended('CapReached');
    const raised: ProjectSettings = {
      ...fakeReader,
      budget: { ...fakeReader.budget, run: { maxCostMicros: 7_000_000, maxTokens: 9_000_000 } },
    };
    await projects.updateSettings({
      ...{ userId: userAmy.userId, projectId: project.id, updatedAt: 1 },
      settings: raised,
      expectedVersion: undefined,
    });

    await resume().execute(as(userAmy, run.id));

    const manifest = await harness.manifests.read(harness.scopeOf(run));
    expect(manifest?.caps.run).toEqual({ maxCostMicros: 7_000_000, maxTokens: 9_000_000 });
    expect(manifest).toMatchObject({ endState: null, endedAt: null, stage: 'understand' });
  });
});

describe('ResumeRun refusals', () => {
  it('RF-1105 finds nothing for another user run or an unknown id', async () => {
    const { resume, ended } = await setup();
    const run = await ended('CapReached');

    const other = await resume().execute(as(userBob, run.id));
    const unknown = await resume().execute(as(userAmy, '00000000-0000-4000-b000-ffffffffffff'));

    expect(other).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(unknown).toEqual({ ok: false, error: ERROR_CODES.notFound });
  });

  it('RF-006 refuses a run that completed', async () => {
    const { resume, ended } = await setup();
    const run = await ended('Completed');

    const resumed = await resume().execute(as(userAmy, run.id));

    expect(resumed).toEqual({ ok: false, error: ERROR_CODES.runNotResumable });
  });

  it('RF-006 refuses a scan run: only an understand run has tasks to resume', async () => {
    const { resume, ended } = await setup();
    const run = await ended('Failed', { stage: 'scan' });

    const resumed = await resume().execute(as(userAmy, run.id));

    expect(resumed).toEqual({ ok: false, error: ERROR_CODES.runNotResumable });
  });
});

describe('ResumeRun, twice and with consent', () => {
  it('RF-006 queues a run once when Resume is pressed twice', async () => {
    const { harness, resume, ended } = await setup();
    const run = await ended('CapReached');

    const results = await Promise.all([
      resume().execute(as(userAmy, run.id)),
      resume().execute(as(userAmy, run.id)),
    ]);

    expect(results.map((result) => result.ok).sort()).toEqual([false, true]);
    expect(results.find((result) => !result.ok)).toEqual({
      ok: false,
      error: ERROR_CODES.runNotResumable,
    });
    expect(harness.executor.startedKeys).toEqual([run.runKey, run.runKey]);
  });

  it('RF-143 refuses a resume whose reader would send code to the cloud without the run consent', async () => {
    const { harness, resume, ended } = await setup(cloudReader);
    const run = await ended('CapReached', { cloudConsent: false });

    const resumed = await resume().execute(as(userAmy, run.id));

    expect(resumed).toEqual({ ok: false, error: ERROR_CODES.cloudConsentMissing });
    expect((await harness.runs.find(userAmy.userId, run.id))?.queueState).toBe('Ended');
  });
});

describe('ResumeRun, consent and a failing manifest', () => {
  it('RF-143 resumes a cloud run that had the consent', async () => {
    const { resume, ended } = await setup(cloudReader);
    const run = await ended('CapReached', { cloudConsent: true });

    const resumed = await resume().execute(as(userAmy, run.id));

    expect(resumed.ok).toBe(true);
  });

  it('RNF-002 ends the run again when its manifest cannot be rewritten, and rethrows', async () => {
    const { harness, resume, ended } = await setup();
    const run = await ended('CapReached');
    const failing: RunManifestStore = {
      read: (scope) => harness.manifests.read(scope),
      write: () => Promise.reject(new Error('disk full')),
    };

    await expect(resume(failing).execute(as(userAmy, run.id))).rejects.toThrow('disk full');

    const stored = await harness.runs.find(userAmy.userId, run.id);
    expect(stored).toMatchObject({ queueState: 'Ended', endState: 'Interrupted' });
  });
});

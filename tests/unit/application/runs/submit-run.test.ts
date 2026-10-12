import { describe, expect, it, vi } from 'vitest';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { SequenceIdGenerator } from '../../../support/sequence-id-generator.js';
import { SubmitRun } from '../../../../src/application/use-cases/submit-run.js';

// RF-003, RF-1108, RF-1105: a run is accepted into the queue with its own folder name and manifest.

describe('SubmitRun', () => {
  it('RF-1108 returns the queued run with its position, or the started run with none', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const first = await h.submit.execute({
      actor: userAmy,
      project: sampleProject({ userId: userAmy.userId }),
      stage: 'scan',
      options: {},
    });
    const second = await h.submit.execute({
      actor: userBob,
      project: sampleProject({ userId: userBob.userId }),
      stage: 'scan',
      options: {},
    });

    expect(first).toMatchObject({ ok: true, value: { run: { queueState: 'Running' } } });
    expect(second).toMatchObject({
      ok: true,
      value: { run: { queueState: 'Queued' }, position: 1 },
    });
  });
});

describe('SubmitRun folder names and options', () => {
  it('RF-003 gives two runs of one project in the same second different folder names', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const sameSecond = new SequenceIdGenerator();
    const submit = new SubmitRun({
      ...{ runs: h.runs, manifests: h.manifests, queue: h.queue, clock: h.clock },
      ids: { runId: () => '20261012-100000-scan', uuid: () => sameSecond.uuid() },
      rosettaVersion: '1.2.3-test',
    });
    const project = sampleProject({ userId: userAmy.userId });
    const request = { actor: userAmy, project, stage: 'scan', options: {} } as const;

    const first = await submit.execute(request);
    const second = await submit.execute(request);

    const keys = [first, second].map((result) => (result.ok ? result.value.run.runKey : ''));
    expect(new Set(keys).size).toBe(2);
    expect(keys[1]).toMatch(/^\d{8}-\d{6}-scan-\d+$/);
  });

  it('RF-003 keeps the options of the request in the manifest', async () => {
    const h = createRunHarness();
    const project = sampleProject({ userId: userAmy.userId });

    const submitted = await h.submit.execute({
      actor: userAmy,
      project,
      stage: 'understand',
      options: { areas: ['catalog'] },
    });

    if (!submitted.ok) throw new Error('The run was not accepted');
    expect(await h.manifests.read(h.scopeOf(submitted.value.run))).toMatchObject({
      stage: 'understand',
      options: { areas: ['catalog'] },
    });
  });
});

describe('SubmitRun access', () => {
  it('RF-1105 refuses a project of another user', async () => {
    const h = createRunHarness();

    const submitted = await h.submit.execute({
      actor: userBob,
      project: sampleProject({ userId: userAmy.userId }),
      stage: 'scan',
      options: {},
    });

    expect(submitted).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(h.executor.started).toHaveLength(0);
  });
});

describe('SubmitRun and stages', () => {
  it('RF-1108 refuses a stage the server has no executor for yet, queueing nothing', async () => {
    const h = createRunHarness({ stages: ['scan'] });

    const submitted = await h.submit.execute({
      actor: userAmy,
      project: sampleProject({ userId: userAmy.userId }),
      stage: 'plan',
      options: {},
    });

    expect(submitted).toEqual({ ok: false, error: ERROR_CODES.runStageNotAvailable });
    expect(h.executor.started).toHaveLength(0);
  });
});

describe('SubmitRun and a manifest that cannot be written', () => {
  it('RF-003 cancels the run it queued and passes the failure on', async () => {
    const h = createRunHarness();
    const failure = new RosettaError(ERROR_CODES.runManifestFailed);
    vi.spyOn(h.manifests, 'write').mockRejectedValue(failure);
    const project = sampleProject({ userId: userAmy.userId });

    await expect(
      h.submit.execute({ actor: userAmy, project, stage: 'scan', options: {} }),
    ).rejects.toBe(failure);

    const [left] = await h.runs.list(userAmy.userId, project.id);
    expect(left).toMatchObject({ queueState: 'Ended', endState: 'Interrupted' });
    expect(h.executor.started).toHaveLength(0);
  });
});

import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';

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

  it('RF-003 gives two runs of one project in the same second different folder names', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const project = sampleProject({ userId: userAmy.userId });
    const request = { actor: userAmy, project, stage: 'scan', options: {} } as const;

    const first = await h.submit.execute(request);
    const second = await h.submit.execute(request);

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

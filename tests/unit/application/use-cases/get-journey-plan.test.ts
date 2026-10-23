import { describe, expect, it } from 'vitest';
import { scopeOf } from '../../../../src/application/runs/run-scope.js';
import { addPlanRun } from '../../../support/journey-seed.js';
import { sampleManifest, sampleRun } from '../../../support/run-fixtures.js';
import {
  actor,
  briefSavedAt,
  hour,
  olderKey,
  setup,
  sourceKey,
} from '../../../support/journey-setup.js';

// RF-615, RF-614, DEC-143: the plan run of the journey is the newest one written from the source
// run, found through the manifests, whichever run the page is about.

describe('GetJourney: the plan run', () => {
  it('RF-615 a failed plan run is shown with its code and its cost, and there is no package', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    const failed = await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', sourceRunKey: sourceKey, endState: 'Failed' },
      ...{ errorCode: 'RST-1803', startedAt: briefSavedAt + hour, costMicros: 31_000 },
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({
      ok: true,
      value: {
        briefSaved: true,
        plan: { id: failed.id, endState: 'Failed', errorCode: 'RST-1803', costMicros: 31_000 },
        handoff: null,
      },
    });
  });

  it('RF-615 opening the plan run shows the journey of the understand run it was written from', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    const plan = await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', sourceRunKey: sourceKey, endState: 'Completed' },
      startedAt: briefSavedAt + hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: plan.id });

    expect(result).toMatchObject({
      ok: true,
      value: {
        source: { id: understand?.id },
        plan: { id: plan.id },
        handoff: { runId: plan.id, runKey: '20261012-100000-plan', outOfDate: false, gaps: false },
      },
    });
  });
});

describe('GetJourney: the plan run (2)', () => {
  it('RF-401 DEC-155 a plan run that ended with RST-1522 is shown with that code', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    const failed = await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', sourceRunKey: sourceKey, endState: 'Failed' },
      ...{ errorCode: 'RST-1522', startedAt: briefSavedAt + hour, costMicros: 0 },
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({
      ok: true,
      value: { plan: { id: failed.id, endState: 'Failed', errorCode: 'RST-1522' } },
    });
  });

  it('RF-615 a plan run written from another understand run is not the plan of this one', async () => {
    const { project, parts, seed, journey } = await setup();
    await seed({ run: { runKey: olderKey } });
    const newer = await seed({ brief: false, run: { runKey: sourceKey } });
    await addPlanRun(parts, project, {
      ...{ runKey: '20261011-100000-plan', sourceRunKey: olderKey, endState: 'Completed' },
      startedAt: briefSavedAt + hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: newer?.id });

    expect(result).toMatchObject({ ok: true, value: { plan: null } });
  });

  it('RF-615 the newest plan run of the source is the one shown', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', sourceRunKey: sourceKey, endState: 'Failed' },
      startedAt: briefSavedAt + hour,
    });
    const again = await addPlanRun(parts, project, {
      ...{ runKey: '20261012-110000-plan', sourceRunKey: sourceKey, endState: 'Completed' },
      startedAt: briefSavedAt + 2 * hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { plan: { id: again.id } } });
  });
});

describe('GetJourney: a plan run that is queued', () => {
  it('EV-12 a queued plan run is the journey plan before its manifest names the source', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    const queued = sampleRun({
      ...{ userId: project.userId, projectId: project.id, stage: 'plan' },
      ...{ runKey: '20261012-110000-plan', queueState: 'Queued', endState: null, startedAt: null },
      queuedAt: briefSavedAt + hour,
    });
    await parts.runs.insert(queued);
    // RF-614: the start names the source by its id; the planner records the folder name later.
    await parts.manifests.write(
      scopeOf(queued),
      sampleManifest({
        runId: queued.runKey,
        stage: 'plan',
        endState: null,
        options: { sourceRunId: understand?.id },
      }),
    );

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({
      ok: true,
      value: { plan: { id: queued.id, queueState: 'Queued' } },
    });
  });
});

describe('GetJourney: a plan run that is running', () => {
  it('EV-12 a running plan run with no folder name in its manifest is found through its options', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    const running = sampleRun({
      ...{ userId: project.userId, projectId: project.id, stage: 'plan' },
      ...{ runKey: '20261012-110000-plan', queueState: 'Running', endState: null },
      startedAt: briefSavedAt + hour,
    });
    await parts.runs.insert(running);
    await parts.manifests.write(
      scopeOf(running),
      sampleManifest({
        runId: running.runKey,
        stage: 'plan',
        endState: null,
        options: { sourceRunId: understand?.id },
      }),
    );

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({
      ok: true,
      value: { plan: { id: running.id, queueState: 'Running' } },
    });
  });
});

describe('GetJourney: a plan run that ended', () => {
  it('EV-12 an ended plan run whose manifest has a null source is placed through its options', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    const ended = sampleRun({
      ...{ userId: project.userId, projectId: project.id, stage: 'plan' },
      ...{ runKey: '20261012-110000-plan', queueState: 'Ended', endState: 'Failed' },
      startedAt: briefSavedAt + hour,
      endedAt: briefSavedAt + hour + 60_000,
    });
    await parts.runs.insert(ended);
    await parts.manifests.write(
      scopeOf(ended),
      sampleManifest({
        runId: ended.runKey,
        stage: 'plan',
        endState: 'Failed',
        options: { sourceRunId: understand?.id },
      }),
    );

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({
      ok: true,
      value: { plan: { id: ended.id, endState: 'Failed' } },
    });
  });
});

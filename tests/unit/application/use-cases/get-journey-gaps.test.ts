import { describe, expect, it } from 'vitest';
import { addPlanRun } from '../../../support/journey-seed.js';
import { actor, briefSavedAt, hour, setup, sourceKey } from '../../../support/journey-setup.js';

// RF-615, RF-627 (Q-44): a plan run that wrote the package and ended `Failed` with RST-1806 leaves a
// package with gaps. It is the package of the journey, flagged `gaps`, until a later run replaces it;
// a plan run that failed with any other code wrote none.

const gapsRun = {
  ...{ runKey: '20261012-100000-plan', sourceRunKey: sourceKey, endState: 'Failed' as const },
  ...{ errorCode: 'RST-1806', startedAt: briefSavedAt + hour },
};

describe('GetJourney: a package written with gaps', () => {
  it('RF-627 a plan run that ended RST-1806 is the package, flagged as having gaps', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    const written = await addPlanRun(parts, project, gapsRun);

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({
      ok: true,
      value: {
        plan: { id: written.id, endState: 'Failed', errorCode: 'RST-1806' },
        handoff: { runId: written.id, outOfDate: false, gaps: true },
      },
    });
  });

  it('RF-615 a completed package carries no gaps', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    await addPlanRun(parts, project, {
      ...{ runKey: gapsRun.runKey, sourceRunKey: sourceKey, endState: 'Completed' },
      startedAt: briefSavedAt + hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { handoff: { gaps: false } } });
  });

  it('RF-627 a later completed run replaces the package with gaps', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    await addPlanRun(parts, project, gapsRun);
    const later = await addPlanRun(parts, project, {
      ...{ runKey: '20261012-110000-plan', sourceRunKey: sourceKey, endState: 'Completed' },
      startedAt: briefSavedAt + 2 * hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({
      ok: true,
      value: { handoff: { runId: later.id, gaps: false } },
    });
  });
});
describe('GetJourney: a package written with gaps (2)', () => {
  it('RF-627 a later plan run that failed another way leaves the package with gaps in place', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    const written = await addPlanRun(parts, project, gapsRun);
    await addPlanRun(parts, project, {
      ...{ runKey: '20261012-110000-plan', sourceRunKey: sourceKey, endState: 'Failed' },
      ...{ errorCode: 'RST-1803', startedAt: briefSavedAt + 2 * hour },
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({
      ok: true,
      value: { handoff: { runId: written.id, gaps: true } },
    });
  });

  it('RF-615 a plan run that failed another way wrote no package', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    await addPlanRun(parts, project, { ...gapsRun, errorCode: 'RST-1803' });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { handoff: null } });
  });
});

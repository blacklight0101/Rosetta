import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { addPlanRun } from '../../../support/journey-seed.js';
import {
  actor,
  briefSavedAt,
  hour,
  olderKey,
  setup,
  sourceKey,
} from '../../../support/journey-setup.js';

// RF-615, DEC-143 Q-C: the package of the journey is the project's newest completed plan run; it is
// out of date when the brief was saved after it began, when it was written from another understand
// run, or when the source run ended after it began.

describe('GetJourney: a package that is out of date', () => {
  it('RF-615 a brief saved after the package began marks the package out of date', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    await addPlanRun(parts, project, {
      ...{ runKey: '20261012-080000-plan', sourceRunKey: sourceKey, endState: 'Completed' },
      startedAt: briefSavedAt - hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { handoff: { outOfDate: true } } });
  });

  it('RF-615 a package written from another understand run is out of date for this one', async () => {
    const { project, parts, seed, journey } = await setup();
    await seed({ run: { runKey: olderKey } });
    const newer = await seed({ brief: false, run: { runKey: sourceKey } });
    await addPlanRun(parts, project, {
      ...{ runKey: '20261011-100000-plan', sourceRunKey: olderKey, endState: 'Completed' },
      startedAt: briefSavedAt + hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: newer?.id });

    expect(result).toMatchObject({ ok: true, value: { handoff: { outOfDate: true } } });
  });
});

describe('GetJourney: a package that is out of date (2)', () => {
  it('RF-615 a source run that ended after the package began marks the package out of date', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed({ run: { endedAt: briefSavedAt + 3 * hour } });
    await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', sourceRunKey: sourceKey, endState: 'Completed' },
      startedAt: briefSavedAt + hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { handoff: { outOfDate: true } } });
  });

  it('RF-615 a plan run that did not complete is not a package', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', sourceRunKey: sourceKey, endState: 'CapReached' },
      startedAt: briefSavedAt + hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { handoff: null } });
  });

  it('RF-615 a plan run whose manifest names no source is judged by the brief alone', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', endState: 'Completed' },
      startedAt: briefSavedAt + hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({
      ok: true,
      value: { plan: null, handoff: { outOfDate: false } },
    });
  });
});

describe('GetJourney: a package that is out of date (2) (3)', () => {
  it('RF-615 a manifest that cannot be read leaves that plan run out of the plan of the source', async () => {
    const message = 'The file is not JSON.';
    const broken = {
      read: () => Promise.reject(new RosettaError(ERROR_CODES.runManifestFailed, message)),
    };
    const { project, parts, seed, journey } = await setup(broken);
    const understand = await seed();
    await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', sourceRunKey: sourceKey, endState: 'Completed' },
      startedAt: briefSavedAt + hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { plan: null } });
  });
});

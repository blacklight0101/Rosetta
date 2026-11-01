import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { addPlanRun, addScanRun } from '../../../support/journey-seed.js';
import {
  account,
  actor,
  briefSavedAt,
  hour,
  setup,
  sourceKey,
} from '../../../support/journey-setup.js';
import { eventFor } from '../../../support/run-event-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-615: the guards of the journey facts, each with the case that needs it: a plan run whose source
// is gone, a source that is not an understand run, a package judged without a brief, a damaged
// manifest that is not the manifest store's own refusal, and a log that still ends with the end of
// an earlier go of a run that is queued again.

describe('GetJourney: a plan run whose source cannot be found', () => {
  it('RF-615 a plan run whose source run is gone shows the journey of the newest understand run', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    const plan = await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', endState: 'Completed' },
      ...{ sourceRunKey: '20260101-000000-understand', startedAt: briefSavedAt + hour },
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: plan.id });

    expect(result).toMatchObject({ ok: true, value: { source: { id: understand?.id } } });
  });

  it('RF-615 a plan run whose manifest names a run that is not an understand run is not placed there', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed();
    const scan = await addScanRun(parts, project, {
      ...{ runKey: '20261001-090000-scan', endState: 'Completed' },
    });
    const plan = await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', sourceRunKey: scan.runKey, endState: 'Failed' },
      startedAt: briefSavedAt + hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: plan.id });

    expect(result).toMatchObject({ ok: true, value: { source: { id: understand?.id } } });
  });
});

describe('GetJourney: questions that were answered', () => {
  it('RF-615 an answered question is not an open one', async () => {
    const { project, seed, journey, priorCards } = await setup();
    const understand = await seed({ brief: false, answer: 'Managers only.' });
    const ref = { userId: account.id, projectId: project.id };
    await priorCards.markAnswered(ref, sourceKey, ['OQ-001']);

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({ ok: true, value: { source: { openQuestions: 1 } } });
  });
});

describe('GetJourney: the package without a brief', () => {
  it('RF-615 a package is not out of date for a brief that was never saved', async () => {
    const { project, parts, seed, journey } = await setup();
    const understand = await seed({ brief: false });
    await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', sourceRunKey: sourceKey, endState: 'Completed' },
      startedAt: briefSavedAt + hour,
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({
      ok: true,
      value: { briefSaved: false, handoff: { outOfDate: false } },
    });
  });
});

describe('GetJourney: what is not the journey own to hide', () => {
  it('RF-615 a failure of the manifest store that is not its own refusal is not hidden', async () => {
    const broken = { read: () => Promise.reject(new TypeError('The disk went away.')) };
    const { project, parts, seed, journey } = await setup(broken);
    await seed();
    await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', sourceRunKey: sourceKey, endState: 'Completed' },
      startedAt: briefSavedAt + hour,
    });

    await expect(journey.execute({ actor, projectId: project.id })).rejects.toThrow(
      'The disk went away.',
    );
  });

  it('RF-615 the refusal of the manifest store is told apart from any other failure by its type', async () => {
    const refusal = new RosettaError(ERROR_CODES.runManifestFailed, 'The file is not JSON.');
    const broken = { read: () => Promise.reject(refusal) };
    const { project, parts, seed, journey } = await setup(broken);
    await seed();
    await addPlanRun(parts, project, {
      ...{ runKey: '20261012-100000-plan', sourceRunKey: sourceKey, endState: 'Completed' },
      startedAt: briefSavedAt + hour,
    });

    const result = await journey.execute({ actor, projectId: project.id });

    expect(result.ok).toBe(true);
  });
});

describe('GetJourney: the queue', () => {
  it('RF-1108 EV-80 a queued run has its place in the server queue and a run that is not queued has none', async () => {
    const { project, parts, seed, journey } = await setup();
    await parts.runs.insert(sampleRun({ queueState: 'Queued', queuedAt: 1 }));
    const queued = await seed({
      brief: false,
      run: { queueState: 'Queued', endState: null, endedAt: null, queuedAt: 2_000_000_000_000 },
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: queued?.id });

    expect(result).toMatchObject({ ok: true, value: { source: { position: 2 } } });
  });

  it('RF-1108 EV-80 an ended run has no place', async () => {
    const { project, seed, journey } = await setup();
    const ended = await seed({ brief: false });

    const result = await journey.execute({ actor, projectId: project.id, runId: ended?.id });

    expect(result).toMatchObject({ ok: true, value: { source: { position: null } } });
  });
});

describe('GetJourney: a run that is queued again', () => {
  it('RF-615 RF-006 a run that is queued again has no error code, though its log still ends with its last end', async () => {
    const { project, parts, seed, journey } = await setup();
    const queued = await seed({
      brief: false,
      run: { queueState: 'Queued', endState: null, endedAt: null },
    });
    const scope = {
      ...{ id: queued?.id ?? '', userId: account.id, projectId: project.id },
      runKey: sourceKey,
    };
    const ended = { endState: 'Failed', errorCode: 'RST-1203' };
    await parts.events.publish(scope, eventFor(scope, 1, 'run.ended', ended));

    const result = await journey.execute({ actor, projectId: project.id, runId: queued?.id });

    expect(result).toMatchObject({
      ok: true,
      value: { source: { queueState: 'Queued', errorCode: null } },
    });
  });
});

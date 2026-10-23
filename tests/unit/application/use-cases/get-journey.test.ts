import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { addScanRun } from '../../../support/journey-seed.js';
import { account, actor, olderKey, setup, sourceKey } from '../../../support/journey-setup.js';
import { eventFor } from '../../../support/run-event-fixtures.js';
import { sampleRun } from '../../../support/run-fixtures.js';

// RF-615, RF-614, RF-1105, DEC-143: the facts of the journey from code to package, derived from the
// run index, the manifests, the saved brief and the end of each run (see journey-setup.ts): the
// understand run, whichever run the page is about, the scan, and what is refused.

describe('GetJourney: the understand run', () => {
  it('RF-615 a project with no understand run has nothing but the next step to take', async () => {
    const { project, journey } = await setup();

    const result = await journey.execute({ actor, projectId: project.id });

    expect(result).toEqual({
      ok: true,
      value: { source: null, scanRunId: null, briefSaved: false, plan: null, handoff: null },
    });
  });

  it('RF-615 a completed run gives its cost, its Supported claims and its open questions', async () => {
    const { project, seed, journey } = await setup();
    const understand = await seed({
      brief: false,
      run: {
        endedAt: 1_760_000_000_000,
        totals: { costMicros: 120_000, inputTokens: 1, outputTokens: 1, cachedInputTokens: 0 },
      },
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: understand?.id });

    expect(result).toMatchObject({
      ok: true,
      value: {
        source: {
          ...{ id: understand?.id, runKey: sourceKey, queueState: 'Ended' },
          ...{ endState: 'Completed', endedAt: 1_760_000_000_000, errorCode: null },
          ...{ costMicros: 120_000, supportedClaims: 4, openQuestions: 2 },
        },
        briefSaved: false,
      },
    });
  });
});

describe('GetJourney: the understand run (stopped)', () => {
  it('RF-615 P3-121 a run that stopped at a cap gives its error code, its Supported claims and no questions', async () => {
    const { project, parts, seed, journey } = await setup();
    const stopped = await seed({ brief: false, run: { endState: 'CapReached' } });
    const scope = {
      ...{ id: stopped?.id ?? '', userId: account.id, projectId: project.id },
      runKey: sourceKey,
    };
    const ended = { endState: 'CapReached', errorCode: 'RST-1403' };
    await parts.events.publish(scope, eventFor(scope, 1, 'run.ended', ended));

    const result = await journey.execute({ actor, projectId: project.id });

    expect(result).toMatchObject({
      ok: true,
      value: {
        source: {
          ...{ endState: 'CapReached', errorCode: 'RST-1403' },
          ...{ supportedClaims: 4, openQuestions: 0 },
        },
      },
    });
  });

  it('RF-615 the project path is about the newest completed run, not a newer one that failed', async () => {
    const { project, seed, journey } = await setup();
    const done = await seed({ brief: false, run: { runKey: olderKey } });
    await seed({ brief: false, run: { runKey: '20261011-090000-understand', endState: 'Failed' } });

    const result = await journey.execute({ actor, projectId: project.id });

    expect(result).toMatchObject({ ok: true, value: { source: { id: done?.id } } });
  });
});

describe('GetJourney: the understand run (2)', () => {
  it('RF-615 with no completed run the project path is about the newest run, which stopped', async () => {
    const { project, seed, journey } = await setup();
    await seed({ brief: false, run: { runKey: olderKey, endState: 'Failed' } });
    const newest = await seed({
      brief: false,
      run: { runKey: '20261011-090000-understand', endState: 'Interrupted' },
    });

    const result = await journey.execute({ actor, projectId: project.id });

    expect(result).toMatchObject({
      ok: true,
      value: { source: { id: newest?.id, endState: 'Interrupted' } },
    });
  });
});

describe('GetJourney: the understand run (running)', () => {
  it('RF-615 a running understand run has no claims or questions yet', async () => {
    const { project, seed, journey } = await setup();
    const running = await seed({
      brief: false,
      run: { queueState: 'Running', endState: null, startedAt: 1 },
    });

    const result = await journey.execute({ actor, projectId: project.id, runId: running?.id });

    expect(result).toMatchObject({
      ok: true,
      value: {
        source: { queueState: 'Running', endState: null, supportedClaims: 0, openQuestions: 0 },
      },
    });
  });
});

describe('GetJourney: the scan, and what it refuses', () => {
  it('RF-615 the newest completed scan run is the page of the scan step', async () => {
    const { project, parts, seed, journey } = await setup();
    await seed({ brief: false });
    await addScanRun(parts, project, { runKey: '20261009-090000-scan', endState: 'Completed' });
    const newest = await addScanRun(parts, project, {
      ...{ runKey: '20261010-090000-scan', endState: 'Completed' },
    });
    await addScanRun(parts, project, { runKey: '20261011-090000-scan', endState: 'Failed' });

    const result = await journey.execute({ actor, projectId: project.id });

    expect(result).toMatchObject({ ok: true, value: { scanRunId: newest.id } });
  });

  it('RF-1105 another user, another project and a scan run are not found', async () => {
    const { project, parts, seed, journey } = await setup();
    await seed({ brief: false });
    const elsewhere = sampleRun({
      ...{ userId: account.id, projectId: '00000000-0000-4000-a000-0000000000ff' },
      ...{ stage: 'understand', queueState: 'Ended', endState: 'Completed' },
    });
    await parts.runs.insert(elsewhere);
    const scan = await addScanRun(parts, project, {
      ...{ runKey: '20261009-090000-scan', endState: 'Completed' },
    });
    const stranger = { userId: '00000000-0000-4000-9000-0000000000ff', role: 'user' } as const;
    const notFound = { ok: false, error: ERROR_CODES.notFound };

    expect(await journey.execute({ actor: stranger, projectId: project.id })).toEqual(notFound);
    const other = await journey.execute({ actor, projectId: project.id, runId: elsewhere.id });
    const scanned = await journey.execute({ actor, projectId: project.id, runId: scan.id });
    const unknown = await journey.execute({ actor, projectId: project.id, runId: sampleRun().id });
    expect([other, scanned, unknown]).toEqual([notFound, notFound, notFound]);
  });
});

describe('GetJourney: another user', () => {
  it('RF-1105 a run id of another user is not found, and no run of theirs appears in the journey', async () => {
    const { project, parts, seed, journey } = await setup();
    await seed({ brief: false });
    const theirs = sampleRun({
      ...{ userId: '00000000-0000-4000-9000-0000000000ff', projectId: project.id },
      ...{ stage: 'understand', queueState: 'Ended', endState: 'Completed' },
    });
    await parts.runs.insert(theirs);

    const named = await journey.execute({ actor, projectId: project.id, runId: theirs.id });
    const listed = await journey.execute({ actor, projectId: project.id });

    expect(named).toEqual({ ok: false, error: ERROR_CODES.notFound });
    expect(listed).toMatchObject({ ok: true, value: { source: { runKey: sourceKey } } });
  });
});

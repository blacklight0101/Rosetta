import { expect, it } from 'vitest';
import type { RunIndex } from '../../src/application/ports/run-index.js';
import type { Run } from '../../src/domain/runs/run.js';
import { sampleRun } from '../support/run-fixtures.js';

// Architecture section 7: every RunIndex adapter (PgRunIndex, MemoryRunIndex) passes this suite.
// RF-1105: reads are scoped by the owner; RF-003: the end state is set once; RF-1108: queue order.

export const runAmy = '00000000-0000-4000-9000-0000000000a1';
export const runBob = '00000000-0000-4000-9000-0000000000b2';
export const amyProject = '00000000-0000-4000-a000-0000000000a1';
export const amySecondProject = '00000000-0000-4000-a000-0000000000a2';
export const bobProject = '00000000-0000-4000-a000-0000000000b1';
const unknownId = '00000000-0000-4000-b000-00000000ffff';

/** An index whose owners and projects exist, for adapters whose rows reference them. */
export type FreshRuns = () => Promise<RunIndex>;

function amyRun(overrides: Partial<Run> = {}): Run {
  return sampleRun({ userId: runAmy, projectId: amyProject, ...overrides });
}

function bobRun(overrides: Partial<Run> = {}): Run {
  return sampleRun({ userId: runBob, projectId: bobProject, ...overrides });
}

async function stored(index: RunIndex, run: Run): Promise<Run> {
  const inserted = await index.insert(run);
  if (!inserted.ok) throw new Error('The run was not stored');
  return inserted.value;
}

function storingTests(name: string, fresh: FreshRuns): void {
  it(`RF-003 ${name} stores a run and finds it by its owner and id`, async () => {
    const index = await fresh();
    const run = amyRun();

    expect(await index.insert(run)).toEqual({ ok: true, value: run });
    expect(await index.find(runAmy, run.id)).toEqual(run);
  });

  it(`RF-003 ${name} refuses a run key the project already has, and accepts it in another project`, async () => {
    const index = await fresh();
    const first = await stored(index, amyRun({ runKey: '20261012-100000-scan' }));

    const same = await index.insert(amyRun({ runKey: first.runKey }));
    const otherProject = await index.insert(
      amyRun({ runKey: first.runKey, projectId: amySecondProject }),
    );

    expect(same).toEqual({ ok: false, error: 'run-key-taken' });
    expect(otherProject.ok).toBe(true);
  });
}

function scopingTests(name: string, fresh: FreshRuns): void {
  it(`RF-1105 ${name} finds nothing for another user's run id, an unknown id or a bad id`, async () => {
    const index = await fresh();
    const run = await stored(index, amyRun());

    expect(await index.find(runBob, run.id)).toBeUndefined();
    expect(await index.find(runAmy, unknownId)).toBeUndefined();
    expect(await index.find(runAmy, 'not-a-uuid')).toBeUndefined();
  });

  it(`RF-1105 ${name} lists only the runs of the user's project, newest first`, async () => {
    const index = await fresh();
    const older = await stored(index, amyRun({ queuedAt: 1_000 }));
    const newer = await stored(index, amyRun({ queuedAt: 2_000 }));
    await stored(index, amyRun({ projectId: amySecondProject }));
    await stored(index, bobRun());

    expect(await index.list(runAmy, amyProject)).toEqual([newer, older]);
    expect(await index.list(runBob, amyProject)).toEqual([]);
    expect(await index.list(runAmy, 'not-a-uuid')).toEqual([]);
  });
}

function queueTests(name: string, fresh: FreshRuns): void {
  it(`RF-1108 ${name} lists the queued runs of every user in queue order`, async () => {
    const index = await fresh();
    const late = await stored(index, amyRun({ queuedAt: 3_000 }));
    const early = await stored(index, bobRun({ queuedAt: 1_000 }));
    const middle = await stored(index, amyRun({ queuedAt: 2_000 }));
    const started = await stored(index, amyRun({ queuedAt: 500 }));
    await index.start(started.id, 600);

    expect(await index.listQueued()).toEqual([early, middle, late]);
  });

  it(`RF-1108 ${name} starts a queued run once and lists it as running`, async () => {
    const index = await fresh();
    const run = await stored(index, amyRun());

    const started = await index.start(run.id, 5_000);

    expect(started).toEqual({ ...run, queueState: 'Running', startedAt: 5_000 });
    expect(await index.start(run.id, 6_000)).toBeUndefined();
    expect(await index.start(unknownId, 6_000)).toBeUndefined();
    expect(await index.listRunning()).toEqual([started]);
    expect(await index.listQueued()).toEqual([]);
  });
}

function endingTests(name: string, fresh: FreshRuns): void {
  it(`RF-003 ${name} ends a running run once, with its end state and time`, async () => {
    const index = await fresh();
    const run = await stored(index, amyRun());
    await index.start(run.id, 5_000);

    const ended = await index.end(run.id, 'CapReached', 9_000);

    expect(ended).toEqual({
      ...run,
      queueState: 'Ended',
      startedAt: 5_000,
      endState: 'CapReached',
      endedAt: 9_000,
    });
    expect(await index.end(run.id, 'Failed', 9_500)).toBeUndefined();
    expect(await index.find(runAmy, run.id)).toEqual(ended);
    expect(await index.listRunning()).toEqual([]);
  });

  it(`RF-1108 ${name} cancels a queued run as Interrupted and refuses any other end state`, async () => {
    const index = await fresh();
    const run = await stored(index, amyRun());

    expect(await index.end(run.id, 'Completed', 9_000)).toBeUndefined();
    const cancelled = await index.end(run.id, 'Interrupted', 9_000);

    expect(cancelled).toEqual({
      ...run,
      queueState: 'Ended',
      endState: 'Interrupted',
      endedAt: 9_000,
    });
    expect(await index.listQueued()).toEqual([]);
  });

  it(`RF-003 ${name} ends nothing for an unknown run`, async () => {
    const index = await fresh();

    expect(await index.end(unknownId, 'Failed', 9_000)).toBeUndefined();
    expect(await index.end('not-a-uuid', 'Failed', 9_000)).toBeUndefined();
  });
}

function recordingTests(name: string, fresh: FreshRuns): void {
  it(`RF-126 ${name} records the commit and the snapshot folder of a run that has not ended`, async () => {
    const index = await fresh();
    const run = await stored(index, amyRun());
    await index.start(run.id, 5_000);
    const source = { commitSha: 'a'.repeat(40), snapshotKey: `owner__repo@${'a'.repeat(40)}` };

    const updated = await index.recordSource(run.id, source);

    expect(updated).toMatchObject(source);
    expect(await index.find(runAmy, run.id)).toMatchObject(source);
    await index.end(run.id, 'Completed', 9_000);
    expect(
      await index.recordSource(run.id, { ...source, commitSha: 'b'.repeat(40) }),
    ).toBeUndefined();
  });

  it(`RF-1010 ${name} replaces the running totals of a run that has not ended`, async () => {
    const index = await fresh();
    const run = await stored(index, amyRun());
    const totals = { costMicros: 1_250, inputTokens: 300, outputTokens: 40, cachedInputTokens: 5 };

    const updated = await index.recordTotals(run.id, totals);

    expect(updated).toMatchObject({ totals });
    expect(await index.find(runAmy, run.id)).toMatchObject({ totals });
    expect(await index.recordTotals(unknownId, totals)).toBeUndefined();
  });
}

export function runIndexContract(name: string, fresh: FreshRuns): void {
  storingTests(name, fresh);
  scopingTests(name, fresh);
  queueTests(name, fresh);
  endingTests(name, fresh);
  recordingTests(name, fresh);
}

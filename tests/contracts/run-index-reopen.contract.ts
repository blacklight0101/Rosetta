import { expect, it } from 'vitest';
import type { RunIndex } from '../../src/application/ports/run-index.js';
import type { Run } from '../../src/domain/runs/run.js';
import type { RunEndState } from '../../src/domain/runs/run-states.js';
import { sampleRun } from '../support/run-fixtures.js';
import { amyProject, runAmy, runBob, type FreshRuns } from './run-index.contract.js';

// RF-006, RF-1105: every RunIndex adapter (PgRunIndex, MemoryRunIndex) reopens an ended run that
// stopped at a cap, failed or was interrupted, once, for its owner only.

const unknownId = '00000000-0000-4000-b000-00000000ffff';

async function stored(index: RunIndex): Promise<Run> {
  const inserted = await index.insert(sampleRun({ userId: runAmy, projectId: amyProject }));
  if (!inserted.ok) throw new Error('The run was not stored');
  return inserted.value;
}

async function ended(index: RunIndex, endState: RunEndState): Promise<Run> {
  const run = await stored(index);
  await index.start(run.id, 5_000);
  const done = await index.end(run.id, endState, 9_000, { failedAreas: 2 });
  if (done === undefined) throw new Error('The run did not end');
  return done;
}

function endReasonTests(name: string, fresh: FreshRuns): void {
  it(`RF-006 ${name} keeps the reason an interrupted run ended for, and a resume clears it`, async () => {
    const index = await fresh();
    const run = await stored(index);
    await index.start(run.id, 5_000);

    const done = await index.end(run.id, 'Interrupted', 9_000, { endReason: 'Restart' });
    const found = await index.find(runAmy, run.id);
    const reopened = await index.reopen(runAmy, run.id, 20_000);

    expect(done?.endReason).toBe('Restart');
    expect(found?.endReason).toBe('Restart');
    expect(reopened?.endReason).toBeNull();
  });

  it(`RF-006 ${name} keeps the cancel of a queued run, and no reason when none is given`, async () => {
    const index = await fresh();
    const queued = await stored(index);
    const running = await stored(index);
    await index.start(running.id, 5_000);

    const cancelled = await index.end(queued.id, 'Interrupted', 9_000, {
      endReason: 'QueueCancel',
    });
    const plain = await index.end(running.id, 'Interrupted', 9_000);

    expect(cancelled?.endReason).toBe('QueueCancel');
    expect(plain?.endReason).toBeNull();
  });
}

function reopensTests(name: string, fresh: FreshRuns): void {
  it.each(['CapReached', 'Failed', 'Interrupted'] as const)(
    `RF-006 ${name} queues a run that ended %s again at the end of the queue, totals kept`,
    async (endState) => {
      const index = await fresh();
      const run = await ended(index, endState);

      const reopened = await index.reopen(runAmy, run.id, 20_000);

      expect(reopened).toEqual({
        ...run,
        failedAreas: 0,
        queueState: 'Queued',
        endState: null,
        queuedAt: 20_000,
        endedAt: null,
      });
      expect(await index.find(runAmy, run.id)).toEqual(reopened);
      expect((await index.listQueued()).map((each) => each.id)).toEqual([run.id]);
    },
  );

  it(`RF-006 ${name} reopens a run once: the second call finds it queued`, async () => {
    const index = await fresh();
    const run = await ended(index, 'CapReached');

    const first = await index.reopen(runAmy, run.id, 20_000);
    const second = await index.reopen(runAmy, run.id, 21_000);

    expect(first).toBeDefined();
    expect(second).toBeUndefined();
  });
}

function spansTests(name: string, fresh: FreshRuns): void {
  it(`P8-88 ${name} keeps the first start and sums the spans across a resume`, async () => {
    const index = await fresh();
    const run = await ended(index, 'Failed');
    await index.reopen(runAmy, run.id, 20_000);

    const second = await index.start(run.id, 30_000);
    const done = await index.end(run.id, 'Completed', 45_000);

    expect(second).toMatchObject({ startedAt: 5_000, spanStartedAt: 30_000, activeMs: 4_000 });
    expect(done).toMatchObject({
      ...{ startedAt: 5_000, spanStartedAt: null, activeMs: 19_000, endedAt: 45_000 },
    });
    expect(await index.find(runAmy, run.id)).toEqual(done);
  });

  it(`P8-88 ${name} does not count the wait for an answer: pause ends the span, Continue keeps the start`, async () => {
    const index = await fresh();
    const run = await stored(index);
    await index.start(run.id, 5_000);

    const paused = await index.pause(run.id, 8_000, { unreadAreas: 1 });
    const queued = await index.continueAwaiting(runAmy, run.id, 20_000);
    await index.start(run.id, 30_000);
    const done = await index.end(run.id, 'Completed', 33_000);

    expect(paused).toMatchObject({ startedAt: 5_000, spanStartedAt: null, activeMs: 3_000 });
    expect(queued).toMatchObject({ startedAt: 5_000, activeMs: 3_000, queueState: 'Queued' });
    expect(done).toMatchObject({ startedAt: 5_000, activeMs: 6_000, endedAt: 33_000 });
  });

  it(`P8-88 ${name} ends a paused run without adding the wait to its running time`, async () => {
    const index = await fresh();
    const run = await stored(index);
    await index.start(run.id, 5_000);
    await index.pause(run.id, 8_000);

    const done = await index.end(run.id, 'CapReached', 90_000);

    expect(done).toMatchObject({ startedAt: 5_000, activeMs: 3_000, endedAt: 90_000 });
  });
}

function lastSignOfLifeTests(name: string, fresh: FreshRuns): void {
  it(`P8-122 ${name} counts the open span only up to the last sign of life when one is given`, async () => {
    const index = await fresh();
    const run = await stored(index);
    await index.start(run.id, 5_000);

    const done = await index.end(run.id, 'Interrupted', 9_000, { activeUntil: 6_500 });

    expect(done).toMatchObject({ endedAt: 9_000, activeMs: 1_500, spanStartedAt: null });
  });
}

function refusesTests(name: string, fresh: FreshRuns): void {
  it(`RF-006 ${name} does not reopen a run that completed, or one that has not ended`, async () => {
    const index = await fresh();
    const completed = await ended(index, 'Completed');
    const queued = await stored(index);

    expect(await index.reopen(runAmy, completed.id, 20_000)).toBeUndefined();
    expect(await index.reopen(runAmy, queued.id, 20_000)).toBeUndefined();
    expect(await index.find(runAmy, completed.id)).toEqual(completed);
  });

  it(`RF-1105 ${name} does not reopen another user run, an unknown id or a bad id`, async () => {
    const index = await fresh();
    const run = await ended(index, 'CapReached');

    expect(await index.reopen(runBob, run.id, 20_000)).toBeUndefined();
    expect(await index.reopen(runAmy, unknownId, 20_000)).toBeUndefined();
    expect(await index.reopen(runAmy, 'not-a-uuid', 20_000)).toBeUndefined();
    expect(await index.find(runAmy, run.id)).toEqual(run);
  });
}

export function runIndexReopenContract(name: string, fresh: FreshRuns): void {
  reopensTests(name, fresh);
  endReasonTests(name, fresh);
  spansTests(name, fresh);
  lastSignOfLifeTests(name, fresh);
  refusesTests(name, fresh);
}

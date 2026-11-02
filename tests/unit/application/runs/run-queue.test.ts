import { describe, expect, it, vi } from 'vitest';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import type { Actor } from '../../../../src/domain/accounts/actor.js';

// RF-1108: more running runs than the limit queue; the page shows the position; a run starts
// automatically when a slot frees; one user has at most one running run; a queued run can be
// cancelled and then ends as Interrupted.

const userCyd: Actor = { userId: '00000000-0000-4000-9000-0000000000c3', role: 'user' };

describe('the run queue', () => {
  it('RF-1108 starts runs up to the limit and queues the next with its position', async () => {
    const h = createRunHarness({ maxRunning: 2 });

    const first = await h.start(userAmy);
    const second = await h.start(userBob);
    const third = await h.start(userCyd);

    await vi.waitFor(() => {
      expect(h.executor.startedKeys).toEqual([first.runKey, second.runKey]);
    });
    expect((await h.runs.find(userCyd.userId, third.id))?.queueState).toBe('Queued');
    expect(await h.queue.positionOf(third.id)).toBe(1);
    expect(await h.queue.positionOf(first.id)).toBeUndefined();
  });

  it('RF-1108 starts a queued run by itself when a slot frees', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const first = await h.start(userAmy);
    const second = await h.start(userBob);

    h.executor.settle(first.id, { endState: 'Completed' });
    await h.ended(first);

    await vi.waitFor(() => {
      expect(h.executor.startedKeys).toEqual([first.runKey, second.runKey]);
    });
    expect(await h.queue.positionOf(second.id)).toBeUndefined();
  });

  it('RF-1108 numbers the queued runs in the order they were queued', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    await h.start(userAmy);
    const second = await h.start(userBob);
    const third = await h.start(userCyd);

    expect(await h.queue.positionOf(second.id)).toBe(1);
    expect(await h.queue.positionOf(third.id)).toBe(2);
  });
});

describe('the run queue and one run per user', () => {
  it('RF-1108 keeps a user to one running run even when slots are free', async () => {
    const h = createRunHarness({ maxRunning: 3 });

    const first = await h.start(userAmy);
    const second = await h.start(userAmy);

    expect(h.executor.startedKeys).toEqual([first.runKey]);
    expect(await h.queue.positionOf(second.id)).toBe(1);
  });

  it('RF-1108 lets the next user go ahead of a user whose second run has to wait', async () => {
    const h = createRunHarness({ maxRunning: 2 });
    const amyFirst = await h.start(userAmy);
    const amySecond = await h.start(userAmy);
    const bobRun = await h.start(userBob);

    expect(h.executor.startedKeys).toEqual([amyFirst.runKey, bobRun.runKey]);
    expect(await h.queue.positionOf(amySecond.id)).toBe(1);
  });

  it('RF-1108 starts the same user next run once the first one has ended', async () => {
    const h = createRunHarness({ maxRunning: 2 });
    const first = await h.start(userAmy);
    const second = await h.start(userAmy);

    h.executor.settle(first.id, { endState: 'Completed' });
    await h.ended(first);

    await vi.waitFor(() => {
      expect(h.executor.startedKeys).toEqual([first.runKey, second.runKey]);
    });
  });
});

describe('the run queue owner-stop signal', () => {
  it('P8-12 aborts the owner-stop signal on Stop even after a cap has aborted the run signal', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const run = await h.start(userAmy);
    await vi.waitFor(() => {
      expect(h.executor.started).toHaveLength(1);
    });
    const execution = h.executor.started[0];
    execution?.stop(new RosettaError(ERROR_CODES.budgetCapReached));
    const beforeStop = execution?.ownerStop?.aborted;

    await h.queue.stop(userAmy.userId, run.id);

    expect(beforeStop).toBe(false);
    expect(execution?.ownerStop?.aborted).toBe(true);
  });

  it('P8-12 removes the owner-stop signal when the run ends', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const run = await h.start(userAmy);
    await vi.waitFor(() => {
      expect(h.executor.started).toHaveLength(1);
    });
    const stops = (h.queue as unknown as { ownerStops: Map<string, AbortController> }).ownerStops;
    const during = stops.has(run.id);

    h.executor.settle(run.id, { endState: 'Completed' });
    await h.ended(run);

    expect(during).toBe(true);
    expect(stops.has(run.id)).toBe(false);
  });

  it('P8-12 aborts the owner-stop signal on shutdown', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    await h.start(userAmy);
    await vi.waitFor(() => {
      expect(h.executor.started).toHaveLength(1);
    });
    const execution = h.executor.started[0];

    const closing = h.queue.shutDown();
    h.executor.settle(execution?.run.id ?? '', { endState: 'Interrupted' });
    await closing;

    expect(execution?.ownerStop?.aborted).toBe(true);
  });
});

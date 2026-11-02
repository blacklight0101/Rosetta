import { describe, expect, it, vi } from 'vitest';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';
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

    const first = await h.start(userAmy, 'understand');
    const second = await h.start(userAmy, 'understand');

    expect(h.executor.startedKeys).toEqual([first.runKey]);
    expect(await h.queue.positionOf(second.id)).toBe(1);
  });

  it('RF-1108 lets the next user go ahead of a user whose second run has to wait', async () => {
    const h = createRunHarness({ maxRunning: 2 });
    const amyFirst = await h.start(userAmy, 'understand');
    const amySecond = await h.start(userAmy, 'understand');
    const bobRun = await h.start(userBob, 'understand');

    expect(h.executor.startedKeys).toEqual([amyFirst.runKey, bobRun.runKey]);
    expect(await h.queue.positionOf(amySecond.id)).toBe(1);
  });

  it('RF-1108 starts the same user next run once the first one has ended', async () => {
    const h = createRunHarness({ maxRunning: 2 });
    const first = await h.start(userAmy, 'understand');
    const second = await h.start(userAmy, 'understand');

    h.executor.settle(first.id, { endState: 'Completed' });
    await h.ended(first);

    await vi.waitFor(() => {
      expect(h.executor.startedKeys).toEqual([first.runKey, second.runKey]);
    });
  });
});

describe('the run queue and the free scan', () => {
  it('RF-1108 EV-91 starts a scan while a paid run of the same user is running', async () => {
    const h = createRunHarness({ maxRunning: 2 });
    const paid = await h.start(userAmy, 'understand');

    const scan = await h.start(userAmy, 'scan');

    expect(h.executor.startedKeys).toEqual([paid.runKey, scan.runKey]);
    expect(await h.queue.positionOf(scan.id)).toBeUndefined();
  });

  it('RF-1108 EV-91 a running scan does not hold back the next paid run of the user', async () => {
    const h = createRunHarness({ maxRunning: 2 });
    const scan = await h.start(userAmy, 'scan');

    const paid = await h.start(userAmy, 'understand');

    expect(h.executor.startedKeys).toEqual([scan.runKey, paid.runKey]);
  });

  it('RF-1108 EV-91 still keeps a user to one running paid run', async () => {
    const h = createRunHarness({ maxRunning: 3 });
    const first = await h.start(userAmy, 'understand');
    const second = await h.start(userAmy, 'understand');

    expect(h.executor.startedKeys).toEqual([first.runKey]);
    expect(await h.queue.positionOf(second.id)).toBe(1);
  });
});

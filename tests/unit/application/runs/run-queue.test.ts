import { describe, expect, it } from 'vitest';
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

    expect(h.executor.startedKeys).toEqual([first.runKey, second.runKey]);
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

    expect(h.executor.startedKeys).toEqual([first.runKey, second.runKey]);
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

    expect(h.executor.startedKeys).toEqual([first.runKey, second.runKey]);
  });
});

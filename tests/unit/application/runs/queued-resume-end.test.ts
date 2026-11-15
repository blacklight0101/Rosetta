import { describe, expect, it, vi } from 'vitest';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';

// RF-006, RF-1108, P9-05, EV-105: a resumed run that is cancelled while it waits in the queue
// records its end in its event log, after the end of its earlier life.

describe('the end of a resumed run cancelled in the queue', () => {
  it('RF-006 logs the QueueCancel end after the end of the first life, with no error', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const first = await h.start(userAmy);
    await vi.waitFor(() => {
      expect(h.executor.started).toHaveLength(1);
    });
    h.executor.settle(first.id, { endState: 'Failed' });
    await h.ended(first);
    const blocker = await h.start(userBob);
    await vi.waitFor(() => {
      expect(h.executor.started).toHaveLength(2);
    });
    await h.runs.reopen(userAmy.userId, first.id, h.clock.now().getTime());
    await h.queue.dispatch();

    await h.queue.stop(userAmy.userId, first.id);

    expect(await h.runs.find(userAmy.userId, first.id)).toMatchObject({
      endState: 'Interrupted',
      endReason: 'QueueCancel',
    });
    const stored = await h.events.read(h.scopeOf(first), 0);
    const ends = stored.filter((event) => event.type === 'run.ended');
    expect(ends).toHaveLength(2);
    expect(stored.at(-1)?.data).toMatchObject({
      endState: 'Interrupted',
      endReason: 'QueueCancel',
    });
    expect(h.logger.entries.filter((entry) => entry.level === 'error')).toEqual([]);
    expect(blocker.id).not.toBe(first.id);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '../../../../src/domain/runs/run-event.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';

// RF-006, RF-1006, RF-1108: a resumed run that waits in the queue for a run slot. Its log still ends
// with the run.ended of its earlier life, which is not its end: the page that opens it then gets its
// earlier events without that run.ended, and the stream stays open for its next start and its end.
// (Before P8-84 round 3 the stream ended at that run.ended, so the page said "Stopped by you" and
// never followed the run once a slot freed.)

type Harness = ReturnType<typeof createRunHarness>;

function pageOf() {
  const events: RunEvent[] = [];
  const ends = { count: 0 };
  const handlers = {
    onEvent: (event: RunEvent) => events.push(event),
    onEnd: () => {
      ends.count += 1;
    },
  };
  return { events, ends, handlers };
}

/** A run that was stopped, then resumed while no slot was free: queued, its log closed. */
async function requeued(h: Harness): Promise<Run> {
  const run = await h.start(userAmy);
  h.executor.settle(run.id, { endState: 'Interrupted' });
  await h.ended(run);
  await vi.waitFor(async () => {
    const stored = await h.events.read(h.scopeOf(run), 0);
    if (stored.at(-1)?.type !== 'run.ended') throw new Error('The log is not closed');
  });
  await h.runs.reopen(run.userId, run.id, h.clock.now().getTime());
  return run;
}

async function open(h: Harness, run: Run, page: ReturnType<typeof pageOf>) {
  const subscribed = await h.subscribe.execute({
    actor: userAmy,
    runId: run.id,
    afterSeq: 0,
    ...page.handlers,
  });
  if (!subscribed.ok) throw new Error('Not subscribed');
  await subscribed.value.replay();
  return subscribed.value;
}

describe('SubscribeRunEvents for a resumed run that waits in the queue', () => {
  it('RF-006 leaves out the run.ended of the earlier life and keeps the stream open', async () => {
    const h = createRunHarness();
    const run = await requeued(h);
    const page = pageOf();

    await open(h, run, page);

    expect((await h.runs.find(userAmy.userId, run.id))?.queueState).toBe('Queued');
    expect(page.events.map((event) => event.type)).toEqual(['run.started']);
    expect(page.ends.count).toBe(0);
    expect(h.broadcaster.subscriberCount).toBe(1);
  });

  it('RF-006 RF-1108 follows the run once a slot frees: its new start, then its end', async () => {
    const h = createRunHarness();
    const run = await requeued(h);
    const page = pageOf();
    await open(h, run, page);

    await h.queue.dispatch();
    h.executor.settle(run.id, { endState: 'Completed' });
    await h.ended(run);

    await vi.waitFor(() => {
      expect(page.ends.count).toBe(1);
    });
    expect(page.events.map((event) => event.type)).toEqual([
      'run.started',
      'run.started',
      'run.ended',
    ]);
    expect(page.events.at(-1)?.data).toMatchObject({ endState: 'Completed' });
  });

  it('RF-1006 still ends the stream of a run that is ended at its stored run.ended', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.executor.settle(run.id, { endState: 'Interrupted' });
    await h.ended(run);
    const page = pageOf();

    await open(h, run, page);

    expect(page.events.map((event) => event.type)).toEqual(['run.started', 'run.ended']);
    expect(page.ends.count).toBe(1);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '../../../../src/domain/runs/run-event.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';

// RF-1006, RF-1108, P9-04: the run index records a run's end before its manifest is written and its
// run.ended stored. A page that connects in that gap (a quick scan, the compose smoke) must still
// get run.ended, live, and not a stream closed without it.

afterEach(() => {
  vi.useRealTimers();
});

describe('SubscribeRunEvents in the gap between the end of the row and run.ended', () => {
  it('RF-1006 gives run.ended live to a page that connected after the row ended', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const read = h.manifests.read.bind(h.manifests);
    vi.spyOn(h.manifests, 'read').mockImplementation(async (scope) => {
      await gate;
      return read(scope);
    });
    h.executor.settle(run.id, { endState: 'Completed' });
    await vi.waitFor(async () => {
      const row = await h.runs.find(userAmy.userId, run.id);
      if (row?.queueState !== 'Ended') throw new Error('The row has not ended');
    });
    const events: RunEvent[] = [];
    const ends = { count: 0 };

    const subscribed = await h.subscribe.execute({
      actor: userAmy,
      runId: run.id,
      afterSeq: 0,
      onEvent: (event) => events.push(event),
      onEnd: () => {
        ends.count += 1;
      },
    });
    if (!subscribed.ok) throw new Error('Not subscribed');
    const replayed = subscribed.value.replay();
    release();
    await replayed;

    expect(events.at(-1)?.type).toBe('run.ended');
    expect(ends.count).toBe(1);
    expect(h.broadcaster.subscriberCount).toBe(0);
  });
});

describe('SubscribeRunEvents when run.ended is never stored', () => {
  it('RF-1006 P9-14 ends the stream after the 5 s wait when run.ended never comes', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    // The end is never stored: the manifest read that precedes it never answers.
    vi.spyOn(h.manifests, 'read').mockImplementation(() => new Promise(() => undefined));
    h.executor.settle(run.id, { endState: 'Completed' });
    await vi.waitFor(async () => {
      const row = await h.runs.find(userAmy.userId, run.id);
      if (row?.queueState !== 'Ended') throw new Error('The row has not ended');
    });
    const events: RunEvent[] = [];
    const ends = { count: 0 };
    const subscribed = await h.subscribe.execute({
      actor: userAmy,
      runId: run.id,
      afterSeq: 0,
      onEvent: (event) => events.push(event),
      onEnd: () => {
        ends.count += 1;
      },
    });
    if (!subscribed.ok) throw new Error('Not subscribed');

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const replayed = subscribed.value.replay();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(ends.count).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    await replayed;

    expect(ends.count).toBe(1);
    expect(events.map((event) => event.type)).not.toContain('run.ended');
    expect(h.broadcaster.subscriberCount).toBe(0);
  });
});

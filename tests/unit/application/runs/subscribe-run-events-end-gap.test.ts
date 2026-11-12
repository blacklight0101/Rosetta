import { describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '../../../../src/domain/runs/run-event.js';
import { createRunHarness, userAmy } from '../../../support/run-harness.js';

// RF-1006, RF-1108, P9-04: the run index records a run's end before its manifest is written and its
// run.ended stored. A page that connects in that gap (a quick scan, the compose smoke) must still
// get run.ended, live, and not a stream closed without it.

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

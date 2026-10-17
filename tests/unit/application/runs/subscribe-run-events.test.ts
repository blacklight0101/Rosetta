import { describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '../../../../src/domain/runs/run-event.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { eventFor } from '../../../support/run-event-fixtures.js';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';

// RF-1006, RF-1105: a page that connects late reads the stored events before the live ones, with
// no event twice and none missing; the stream ends with run.ended; another user cannot subscribe.

function pageOf(): {
  readonly events: RunEvent[];
  readonly ends: { count: number };
  readonly handlers: { onEvent(event: RunEvent): void; onEnd(): void };
} {
  const events: RunEvent[] = [];
  const ends = { count: 0 };
  return {
    events,
    ends,
    handlers: {
      onEvent: (event) => events.push(event),
      onEnd: () => {
        ends.count += 1;
      },
    },
  };
}

type Harness = ReturnType<typeof createRunHarness>;

interface Open {
  readonly actor: typeof userAmy;
  readonly runId: string;
  readonly afterSeq: number;
  readonly page: ReturnType<typeof pageOf>;
  readonly drained?: () => Promise<void>;
}

/** Subscribes and then replays the stored events, as the events route does once it is sending. */
async function open(h: Harness, request: Open): ReturnType<typeof h.subscribe.execute> {
  const subscribed = await h.subscribe.execute({
    actor: request.actor,
    runId: request.runId,
    afterSeq: request.afterSeq,
    ...request.page.handlers,
    ...(request.drained === undefined ? {} : { drained: request.drained }),
  });
  if (subscribed.ok) await subscribed.value.replay();
  return subscribed;
}

describe('SubscribeRunEvents', () => {
  it('RF-1006 gives a late page the stored events first, then the live ones', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    await h.executor.started[0]?.events.emit('agent.turn', { turn: 1 });
    const page = pageOf();

    const subscribed = await open(h, { actor: userAmy, runId: run.id, afterSeq: 0, page });
    await h.executor.started[0]?.events.emit('agent.turn', { turn: 2 });

    expect(subscribed.ok).toBe(true);
    expect(page.events.map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  it('RF-1006 gives a reconnecting page only the events after the one it last saw', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    await h.executor.started[0]?.events.emit('agent.turn', { turn: 1 });
    const page = pageOf();

    await open(h, { actor: userAmy, runId: run.id, afterSeq: 2, page });

    expect(page.events).toEqual([]);
    await h.executor.started[0]?.events.emit('agent.turn', { turn: 2 });
    expect(page.events.map((event) => event.seq)).toEqual([3]);
  });
});

describe('SubscribeRunEvents the end of the stream', () => {
  it('RF-1006 ends the stream after run.ended and frees the subscription', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const page = pageOf();
    await open(h, { actor: userAmy, runId: run.id, afterSeq: 0, page });

    h.executor.settle(run.id, { endState: 'Completed' });
    await h.ended(run);

    expect(page.events.at(-1)?.type).toBe('run.ended');
    expect(page.ends.count).toBe(1);
    expect(h.broadcaster.subscriberCount).toBe(0);
  });

  it('RF-1006 replays the stored events of a run that has ended and then ends the stream', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.executor.settle(run.id, { endState: 'Failed' });
    await h.ended(run);
    const page = pageOf();

    await open(h, { actor: userAmy, runId: run.id, afterSeq: 0, page });

    expect(page.events.map((event) => event.type)).toEqual(['run.started', 'run.ended']);
    expect(page.ends.count).toBe(1);
    expect(h.broadcaster.subscriberCount).toBe(0);
  });
});

/** Waits until the last stored event of the run is its run.ended. */
async function logClosed(h: Harness, run: Run): Promise<void> {
  await vi.waitFor(async () => {
    const stored = await h.events.read(h.scopeOf(run), 0);
    if (stored.at(-1)?.type !== 'run.ended') throw new Error('The log is not closed');
  });
}

describe('SubscribeRunEvents for a resumed run', () => {
  async function resumed(h: Harness) {
    const run = await h.start(userAmy);
    h.executor.settle(run.id, { endState: 'CapReached' });
    await h.ended(run);
    await logClosed(h, run);
    await h.runs.reopen(run.userId, run.id, h.clock.now().getTime());
    await h.queue.dispatch();
    return run;
  }

  it('RF-006 gives a page of a run that is running again its events after the first end, and keeps the stream open', async () => {
    const h = createRunHarness();
    const run = await resumed(h);
    const page = pageOf();

    await open(h, { actor: userAmy, runId: run.id, afterSeq: 0, page });

    expect(page.events.map((event) => event.type)).toEqual(['run.started', 'run.started']);
    expect(page.ends.count).toBe(0);
    h.executor.settle(run.id, { endState: 'Completed' });
    await h.ended(run);
    await vi.waitFor(() => {
      expect(page.ends.count).toBe(1);
    });
    expect(page.events.at(-1)?.type).toBe('run.ended');
  });

  it('RF-006 ends the stream of a resumed run that has ended again at its last run.ended', async () => {
    const h = createRunHarness();
    const run = await resumed(h);
    h.executor.settle(run.id, { endState: 'Completed' });
    await h.ended(run);
    await logClosed(h, run);
    const page = pageOf();

    await open(h, { actor: userAmy, runId: run.id, afterSeq: 0, page });

    expect(page.events.map((event) => event.type)).toEqual([
      'run.started',
      'run.started',
      'run.ended',
    ]);
    expect(page.ends.count).toBe(1);
  });
});

describe('SubscribeRunEvents access and cleanup', () => {
  it('RF-1105 answers not-found for another user run and subscribes nothing', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const page = pageOf();

    const subscribed = await open(h, { actor: userBob, runId: run.id, afterSeq: 0, page });

    expect(subscribed).toEqual({ ok: false, error: 'not-found' });
    expect(h.broadcaster.subscriberCount).toBe(0);
  });

  it('RF-1006 stops delivering and frees the subscription when the page closes it', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const page = pageOf();
    const subscribed = await open(h, { actor: userAmy, runId: run.id, afterSeq: 0, page });
    if (!subscribed.ok) throw new Error('Not subscribed');

    subscribed.value.close();
    await h.executor.started[0]?.events.emit('agent.turn', { turn: 1 });

    expect(page.events.map((event) => event.seq)).toEqual([1]);
    expect(page.ends.count).toBe(0);
    expect(h.broadcaster.subscriberCount).toBe(0);
  });
});

describe('SubscribeRunEvents races', () => {
  it('RF-1006 delivers an event published while the history is read once and in order', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const scope = h.scopeOf(run);
    const slowReplay = h.events.replay.bind(h.events);
    vi.spyOn(h.events, 'replay').mockImplementation(async (readScope, afterSeq, onBatch) => {
      await slowReplay(readScope, afterSeq, onBatch);
      await h.events.publish(scope, eventFor(scope, 2));
      await h.broadcaster.publish(scope, eventFor(scope, 2));
    });
    const page = pageOf();

    await open(h, { actor: userAmy, runId: run.id, afterSeq: 0, page });

    expect(page.events.map((event) => event.seq)).toEqual([1, 2]);
  });
});

describe('SubscribeRunEvents replay', () => {
  it('RF-1006 waits for the page to drain after each batch of stored events', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const page = pageOf();
    const drained = vi.fn(() => Promise.resolve());

    await open(h, { actor: userAmy, runId: run.id, afterSeq: 0, page, drained });

    expect(drained).toHaveBeenCalled();
    expect(page.events.map((event) => event.seq)).toEqual([1]);
  });

  it('RF-1006 frees the subscription and passes on the error when the stored events cannot be read', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    vi.spyOn(h.events, 'replay').mockRejectedValue(new Error('disk gone'));
    const page = pageOf();

    await expect(open(h, { actor: userAmy, runId: run.id, afterSeq: 0, page })).rejects.toThrow(
      'disk gone',
    );

    expect(h.broadcaster.subscriberCount).toBe(0);
  });

  it('RF-1006 frees the subscription and passes on the error when the last seq cannot be read', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    vi.spyOn(h.events, 'lastSeq').mockRejectedValue(new Error('disk gone'));
    const page = pageOf();

    await expect(
      h.subscribe.execute({ actor: userAmy, runId: run.id, afterSeq: 0, ...page.handlers }),
    ).rejects.toThrow('disk gone');

    expect(h.broadcaster.subscriberCount).toBe(0);
  });
});

describe('SubscribeRunEvents and a sequence number from the future', () => {
  it('RF-1006 still ends the stream with run.ended when the page names a seq beyond the last one', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const page = pageOf();
    await open(h, { actor: userAmy, runId: run.id, afterSeq: 999_999, page });

    h.executor.settle(run.id, { endState: 'Completed' });
    await h.ended(run);

    expect(page.events.at(-1)?.type).toBe('run.ended');
    expect(page.ends.count).toBe(1);
    expect(h.broadcaster.subscriberCount).toBe(0);
  });

  it('RF-1006 ends the stream of a finished run when the page names a seq beyond the last one', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.executor.settle(run.id, { endState: 'Failed' });
    await h.ended(run);
    const page = pageOf();

    await open(h, { actor: userAmy, runId: run.id, afterSeq: 999_999, page });

    expect(page.events).toEqual([]);
    expect(page.ends.count).toBe(1);
  });
});

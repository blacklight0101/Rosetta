import { describe, expect, it, vi } from 'vitest';
import type { RunEvent } from '../../../../src/domain/runs/run-event.js';
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

describe('SubscribeRunEvents', () => {
  it('RF-1006 gives a late page the stored events first, then the live ones', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    await h.executor.started[0]?.events.emit('agent.turn', { turn: 1 });
    const page = pageOf();

    const subscribed = await h.subscribe.execute({
      actor: userAmy,
      runId: run.id,
      afterSeq: 0,
      ...page.handlers,
    });
    await h.executor.started[0]?.events.emit('agent.turn', { turn: 2 });

    expect(subscribed.ok).toBe(true);
    expect(page.events.map((event) => event.seq)).toEqual([1, 2, 3]);
  });

  it('RF-1006 gives a reconnecting page only the events after the one it last saw', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    await h.executor.started[0]?.events.emit('agent.turn', { turn: 1 });
    const page = pageOf();

    await h.subscribe.execute({ actor: userAmy, runId: run.id, afterSeq: 2, ...page.handlers });

    expect(page.events).toEqual([]);
    await h.executor.started[0]?.events.emit('agent.turn', { turn: 2 });
    expect(page.events.map((event) => event.seq)).toEqual([3]);
  });

  it('RF-1006 ends the stream after run.ended and frees the subscription', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const page = pageOf();
    await h.subscribe.execute({ actor: userAmy, runId: run.id, afterSeq: 0, ...page.handlers });

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

    await h.subscribe.execute({ actor: userAmy, runId: run.id, afterSeq: 0, ...page.handlers });

    expect(page.events.map((event) => event.type)).toEqual(['run.started', 'run.ended']);
    expect(page.ends.count).toBe(1);
    expect(h.broadcaster.subscriberCount).toBe(0);
  });
});

describe('SubscribeRunEvents access and cleanup', () => {
  it('RF-1105 answers not-found for another user run and subscribes nothing', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const page = pageOf();

    const subscribed = await h.subscribe.execute({
      actor: userBob,
      runId: run.id,
      afterSeq: 0,
      ...page.handlers,
    });

    expect(subscribed).toEqual({ ok: false, error: 'not-found' });
    expect(h.broadcaster.subscriberCount).toBe(0);
  });

  it('RF-1006 stops delivering and frees the subscription when the page closes it', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const page = pageOf();
    const subscribed = await h.subscribe.execute({
      actor: userAmy,
      runId: run.id,
      afterSeq: 0,
      ...page.handlers,
    });
    if (!subscribed.ok) throw new Error('Not subscribed');

    subscribed.value.close();
    await h.executor.started[0]?.events.emit('agent.turn', { turn: 1 });

    expect(page.events.map((event) => event.seq)).toEqual([1]);
    expect(page.ends.count).toBe(0);
    expect(h.broadcaster.subscriberCount).toBe(0);
  });

  it('RF-1006 delivers an event published while the history is read once and in order', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    const scope = h.scopeOf(run);
    const slowRead = h.events.read.bind(h.events);
    vi.spyOn(h.events, 'read').mockImplementation(async (readScope, afterSeq) => {
      const stored = await slowRead(readScope, afterSeq);
      await h.events.publish(scope, eventFor(scope, 2));
      await h.broadcaster.publish(scope, eventFor(scope, 2));
      return stored;
    });
    const page = pageOf();

    await h.subscribe.execute({ actor: userAmy, runId: run.id, afterSeq: 0, ...page.handlers });

    expect(page.events.map((event) => event.seq)).toEqual([1, 2]);
  });
});

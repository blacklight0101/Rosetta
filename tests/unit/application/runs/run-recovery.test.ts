import { describe, expect, it } from 'vitest';
import { createRunHarness, userAmy, userBob } from '../../../support/run-harness.js';

// RNF-002, RF-1108, DEC-112: when the server starts again, runs left running end as Interrupted
// with their manifest and events consistent, and queued runs stay queued in their order. On a
// graceful shutdown the running runs are stopped the same way.

describe('restart recovery', () => {
  it('RNF-002 ends the runs left running as Interrupted, with the manifest end and run.ended', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.clock.advance(30_000);

    await h.restart().recover();

    expect(await h.runs.find(userAmy.userId, run.id)).toMatchObject({
      queueState: 'Ended',
      endState: 'Interrupted',
    });
    expect(await h.manifests.read(h.scopeOf(run))).toMatchObject({
      endState: 'Interrupted',
      endedAt: '2026-10-12T10:00:30.000Z',
    });
    const stored = await h.events.read(h.scopeOf(run), 0);
    expect(stored.map((event) => event.type)).toEqual(['run.started', 'run.ended']);
    expect(stored.at(-1)?.data).toMatchObject({ endState: 'Interrupted' });
  });

  it('RF-1108 keeps the queued runs queued in their order and starts the first when a slot is free', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    await h.start(userAmy);
    const second = await h.start(userBob);
    const third = await h.start({ userId: '00000000-0000-4000-9000-0000000000c3', role: 'user' });

    const restarted = h.restart();
    await restarted.recover();

    expect(h.executor.startedKeys).toEqual([h.executor.started[0]?.run.runKey, second.runKey]);
    expect(await restarted.positionOf(third.id)).toBe(1);
  });

  it('RNF-002 leaves a run alone that this server is still running', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);

    await h.queue.recover();

    expect((await h.runs.find(userAmy.userId, run.id))?.queueState).toBe('Running');
    expect(h.executor.signalOf(run.id)?.aborted).toBe(false);
  });
});

describe('the running time of a run a restart interrupted', () => {
  it('P8-122 counts as running time only what ran up to the last event, not the downtime', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.clock.advance(20_000);
    await h.executor.started[0]?.events.emit('agent.started', {});
    h.clock.advance(3_600_000);

    await h.restart().recover();

    const ended = await h.runs.find(userAmy.userId, run.id);
    expect(ended).toMatchObject({ endReason: 'Restart', activeMs: 20_000 });
    expect(ended?.endedAt).toBe(Date.parse('2026-10-12T11:00:20.000Z'));
  });

  it('P8-122 counts nothing past the start for a run that left no event but run.started', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.clock.advance(3_600_000);

    await h.restart().recover();

    expect((await h.runs.find(userAmy.userId, run.id))?.activeMs).toBe(0);
  });
});

describe('the running time of a resumed run a restart interrupted', () => {
  it('P8-131 keeps the running time of the earlier spans and adds its last span up to its last event', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.clock.advance(20_000);
    h.executor.settle(run.id, { endState: 'CapReached' });
    await h.ended(run);
    h.clock.advance(600_000);
    await h.runs.reopen(run.userId, run.id, h.clock.now().getTime());
    await h.queue.dispatch();
    h.clock.advance(7_000);
    await h.executor.started[1]?.events.emit('agent.started', {});
    h.clock.advance(3_600_000);

    await h.restart().recover();

    expect(await h.runs.find(userAmy.userId, run.id)).toMatchObject({
      endReason: 'Restart',
      activeMs: 27_000,
    });
  });

  it('P8-131 counts nothing of the last span for a resumed run that recorded no event after it started', async () => {
    const h = createRunHarness();
    const run = await h.start(userAmy);
    h.clock.advance(20_000);
    h.executor.settle(run.id, { endState: 'CapReached' });
    await h.ended(run);
    h.clock.advance(600_000);
    await h.runs.reopen(run.userId, run.id, h.clock.now().getTime());
    await h.queue.dispatch();
    h.clock.advance(3_600_000);

    await h.restart().recover();

    expect((await h.runs.find(userAmy.userId, run.id))?.activeMs).toBe(20_000);
  });
});

describe('shutting down', () => {
  it('RNF-002 stops the running runs so they end as Interrupted, and starts no queued run', async () => {
    const h = createRunHarness({ maxRunning: 1 });
    const running = await h.start(userAmy);
    const waiting = await h.start(userBob);
    h.executor.started[0]?.signal.addEventListener('abort', () => {
      h.executor.settle(running.id, { endState: 'Interrupted' });
    });

    await h.queue.shutDown();

    expect((await h.runs.find(userAmy.userId, running.id))?.endState).toBe('Interrupted');
    expect((await h.runs.find(userBob.userId, waiting.id))?.queueState).toBe('Queued');
    expect(h.executor.startedKeys).toEqual([running.runKey]);
  });
});

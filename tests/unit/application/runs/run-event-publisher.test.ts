import { describe, expect, it, vi } from 'vitest';
import { RunEventPublisher } from '../../../../src/application/runs/run-event-publisher.js';
import { MemoryEventSink } from '../../../../src/infrastructure/events/memory-event-sink.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { eventFor, scopeFor } from '../../../support/run-event-fixtures.js';

// RF-1006: the publisher numbers a run's events from 1 (or after the stored ones) and stamps them
// with the injected clock.

const scope = scopeFor('20261012-100000-scan');

describe('RunEventPublisher', () => {
  it('RF-1006 numbers the events of a new run from 1 and stamps them with the clock', async () => {
    const sink = new MemoryEventSink();
    const clock = new FixedClock('2026-10-12T10:00:00.000Z');
    const publisher = await RunEventPublisher.open({ scope, sink, history: sink, clock });

    await publisher.emit('run.started', { stage: 'scan' });
    clock.advance(1_500);
    await publisher.emit('agent.turn', { turn: 1 }, 'task-1');

    expect(await sink.read(scope, 0)).toEqual([
      {
        schemaVersion: 1,
        seq: 1,
        at: '2026-10-12T10:00:00.000Z',
        runId: scope.runKey,
        type: 'run.started',
        data: { stage: 'scan' },
      },
      {
        schemaVersion: 1,
        seq: 2,
        at: '2026-10-12T10:00:01.500Z',
        runId: scope.runKey,
        type: 'agent.turn',
        agentTaskId: 'task-1',
        data: { turn: 1 },
      },
    ]);
  });

  it('RF-006 continues after the stored events when the run is resumed', async () => {
    const sink = new MemoryEventSink();
    await sink.publish(scope, eventFor(scope, 1));
    await sink.publish(scope, eventFor(scope, 2));
    const clock = new FixedClock('2026-10-12T10:00:00.000Z');

    const publisher = await RunEventPublisher.open({ scope, sink, history: sink, clock });
    const event = await publisher.emit('agent.turn', {});

    expect(event.seq).toBe(3);
  });
});

describe('RunEventPublisher ordering', () => {
  it('RF-1006 keeps the numbers in the order of the calls when events are emitted without waiting', async () => {
    const sink = new MemoryEventSink();
    const clock = new FixedClock('2026-10-12T10:00:00.000Z');
    const publisher = await RunEventPublisher.open({ scope, sink, history: sink, clock });

    await Promise.all([1, 2, 3, 4, 5].map((turn) => publisher.emit('agent.turn', { turn })));

    const stored = await sink.read(scope, 0);
    expect(stored.map((event) => event.seq)).toEqual([1, 2, 3, 4, 5]);
    expect(stored.map((event) => event.data['turn'])).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('RunEventPublisher and a sink that fails', () => {
  it('RF-1006 numbers the next event again after a publish that the sink did not accept', async () => {
    const sink = new MemoryEventSink();
    const clock = new FixedClock('2026-10-12T10:00:00.000Z');
    const publisher = await RunEventPublisher.open({ scope, sink, history: sink, clock });
    const failing = vi.spyOn(sink, 'publish').mockRejectedValueOnce(new Error('disk full'));

    await expect(publisher.emit('run.started', {})).rejects.toThrow('disk full');
    failing.mockRestore();
    const next = await publisher.emit('run.started', {});

    expect(next.seq).toBe(1);
    expect((await sink.read(scope, 0)).map((event) => event.seq)).toEqual([1]);
  });

  it('RF-1006 keeps later emits working when one of several emits without waiting fails', async () => {
    const sink = new MemoryEventSink();
    const clock = new FixedClock('2026-10-12T10:00:00.000Z');
    const publisher = await RunEventPublisher.open({ scope, sink, history: sink, clock });
    vi.spyOn(sink, 'publish').mockRejectedValueOnce(new Error('disk full'));

    const results = await Promise.allSettled(
      [1, 2, 3].map((turn) => publisher.emit('agent.turn', { turn })),
    );

    expect(results.map((result) => result.status)).toEqual(['rejected', 'fulfilled', 'fulfilled']);
    expect((await sink.read(scope, 0)).map((event) => event.seq)).toEqual([1, 2]);
  });
});

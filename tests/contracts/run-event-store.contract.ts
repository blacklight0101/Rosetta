import { expect, it } from 'vitest';
import type { RunEventHistory, RunEventSink } from '../../src/application/ports/run-events.js';
import { ERROR_CODES } from '../../src/domain/errors/codes.js';
import { eventFor, scopeFor } from '../support/run-event-fixtures.js';

// Architecture section 7: every adapter that stores run events (JsonlEventLog, MemoryEventSink)
// passes this suite. RF-1006: events in order with a sequence number, no gaps, `run.ended` last,
// and a page that connects late reads what it missed.

interface EventStore {
  readonly sink: RunEventSink;
  readonly history: RunEventHistory;
}

export type FreshEventStore = () => Promise<EventStore>;

const scope = scopeFor('20261012-100000-scan');
const otherScope = scopeFor('20261012-100000-understand');

function readingTests(name: string, fresh: FreshEventStore): void {
  it(`RF-1006 ${name} stores events in order and reads the ones after a sequence number`, async () => {
    const { sink, history } = await fresh();
    for (const seq of [1, 2, 3, 4]) await sink.publish(scope, eventFor(scope, seq));

    expect((await history.read(scope, 0)).map((event) => event.seq)).toEqual([1, 2, 3, 4]);
    expect((await history.read(scope, 2)).map((event) => event.seq)).toEqual([3, 4]);
    expect(await history.read(scope, 4)).toEqual([]);
    expect(await history.read(scope, 1)).toEqual([
      eventFor(scope, 2),
      eventFor(scope, 3),
      eventFor(scope, 4),
    ]);
  });

  it(`RF-1006 ${name} reads nothing and reports sequence 0 for a run without events`, async () => {
    const { history } = await fresh();

    expect(await history.read(scope, 0)).toEqual([]);
    expect(await history.lastSeq(scope)).toBe(0);
  });

  it(`RF-1006 ${name} reports the last sequence number, so a resumed run continues it`, async () => {
    const { sink, history } = await fresh();
    await sink.publish(scope, eventFor(scope, 1));
    await sink.publish(scope, eventFor(scope, 2));

    expect(await history.lastSeq(scope)).toBe(2);
  });
}

function replayTests(name: string, fresh: FreshEventStore): void {
  it(`RF-1006 ${name} replays the stored events after a sequence number in order, in batches`, async () => {
    const { sink, history } = await fresh();
    for (let seq = 1; seq <= 250; seq += 1) await sink.publish(scope, eventFor(scope, seq));
    const batches: number[][] = [];

    await history.replay(scope, 200, (batch) => {
      batches.push(batch.map((event) => event.seq));
      return Promise.resolve();
    });
    const everything: number[] = [];
    await history.replay(scope, 0, (batch) => {
      everything.push(...batch.map((event) => event.seq));
      return Promise.resolve();
    });

    expect(batches.flat()).toEqual(Array.from({ length: 50 }, (_unused, index) => index + 201));
    expect(everything).toEqual(Array.from({ length: 250 }, (_unused, index) => index + 1));
  });

  it(`RF-1006 ${name} waits for the receiver of a batch before it reads on`, async () => {
    const { sink, history } = await fresh();
    for (let seq = 1; seq <= 250; seq += 1) await sink.publish(scope, eventFor(scope, seq));
    const state = { inside: 0, overlapped: false, batches: 0 };

    await history.replay(scope, 0, async () => {
      state.inside += 1;
      state.batches += 1;
      if (state.inside > 1) state.overlapped = true;
      await new Promise<void>((resolve) => setTimeout(resolve, 1));
      state.inside -= 1;
    });

    expect(state.batches).toBeGreaterThan(1);
    expect(state.overlapped).toBe(false);
  });
}

function replayFailureTests(name: string, fresh: FreshEventStore): void {
  it(`RF-1006 ${name} replays nothing for a run without events and stops when the receiver fails`, async () => {
    const { sink, history } = await fresh();
    const seen: number[] = [];
    await history.replay(scope, 0, (batch) => {
      seen.push(batch.length);
      return Promise.resolve();
    });
    for (let seq = 1; seq <= 250; seq += 1) await sink.publish(scope, eventFor(scope, seq));

    await expect(
      history.replay(scope, 0, () => Promise.reject(new Error('page went away'))),
    ).rejects.toThrow('page went away');
    expect(seen).toEqual([]);
  });
}

function refusalTests(name: string, fresh: FreshEventStore): void {
  it(`RF-1006 ${name} refuses an event that leaves a gap or repeats a sequence number`, async () => {
    const { sink, history } = await fresh();
    await sink.publish(scope, eventFor(scope, 1));

    await expect(sink.publish(scope, eventFor(scope, 3))).rejects.toMatchObject({
      code: ERROR_CODES.runEventRefused,
    });
    await expect(sink.publish(scope, eventFor(scope, 1))).rejects.toMatchObject({
      code: ERROR_CODES.runEventRefused,
    });
    expect((await history.read(scope, 0)).map((event) => event.seq)).toEqual([1]);
  });

  it(`RF-1006 ${name} refuses a first event that does not have sequence number 1`, async () => {
    const { sink } = await fresh();

    await expect(sink.publish(scope, eventFor(scope, 2))).rejects.toMatchObject({
      code: ERROR_CODES.runEventRefused,
    });
  });

  it(`RF-1006 ${name} keeps run.ended last: nothing is accepted after it`, async () => {
    const { sink, history } = await fresh();
    await sink.publish(scope, eventFor(scope, 1));
    await sink.publish(scope, eventFor(scope, 2, 'run.ended', { endState: 'Completed' }));

    await expect(sink.publish(scope, eventFor(scope, 3))).rejects.toMatchObject({
      code: ERROR_CODES.runEventRefused,
    });
    const stored = await history.read(scope, 0);
    expect(stored.at(-1)?.type).toBe('run.ended');
    expect(stored).toHaveLength(2);
  });

  it(`RF-1006 ${name} refuses an event that names another run`, async () => {
    const { sink } = await fresh();

    await expect(sink.publish(scope, eventFor(otherScope, 1))).rejects.toMatchObject({
      code: ERROR_CODES.runEventRefused,
    });
  });
}

function isolationTests(name: string, fresh: FreshEventStore): void {
  it(`RF-1006 ${name} keeps the events of two runs apart`, async () => {
    const { sink, history } = await fresh();
    await sink.publish(scope, eventFor(scope, 1));
    await sink.publish(otherScope, eventFor(otherScope, 1));
    await sink.publish(otherScope, eventFor(otherScope, 2));

    expect(await history.lastSeq(scope)).toBe(1);
    expect(await history.lastSeq(otherScope)).toBe(2);
    expect(
      (await history.read(otherScope, 0)).every((event) => event.runId === otherScope.runKey),
    ).toBe(true);
  });

  it(`RF-1006 ${name} keeps the order of events published without waiting for each other`, async () => {
    const { sink, history } = await fresh();
    const seqs = Array.from({ length: 25 }, (_unused, index) => index + 1);

    await Promise.all(seqs.map((seq) => sink.publish(scope, eventFor(scope, seq))));

    expect((await history.read(scope, 0)).map((event) => event.seq)).toEqual(seqs);
  });
}

export function runEventStoreContract(name: string, fresh: FreshEventStore): void {
  readingTests(name, fresh);
  replayTests(name, fresh);
  replayFailureTests(name, fresh);
  refusalTests(name, fresh);
  isolationTests(name, fresh);
}

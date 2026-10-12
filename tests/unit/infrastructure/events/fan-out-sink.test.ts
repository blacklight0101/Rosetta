import { describe, expect, it } from 'vitest';
import type { RunEventSink } from '../../../../src/application/ports/run-events.js';
import { FanOutSink } from '../../../../src/infrastructure/events/fan-out-sink.js';
import { MemoryEventSink } from '../../../../src/infrastructure/events/memory-event-sink.js';
import { eventFor, scopeFor } from '../../../support/run-event-fixtures.js';

// RF-1006: one event goes to the stored log and to every connected page, the log first, so a page
// never sees an event that the log does not have.

const scope = scopeFor('20261012-100000-scan');

describe('FanOutSink', () => {
  it('RF-1006 publishes each event to every sink, in the order the sinks were given', async () => {
    const order: string[] = [];
    const named = (name: string): RunEventSink => ({
      publish: () => {
        order.push(name);
        return Promise.resolve();
      },
    });
    const sink = new FanOutSink([named('log'), named('sse')]);

    await sink.publish(scope, eventFor(scope, 1));

    expect(order).toEqual(['log', 'sse']);
  });

  it('RF-1006 does not forward an event that the first sink refused, and passes the refusal on', async () => {
    const log = new MemoryEventSink();
    const later = new MemoryEventSink();
    const sink = new FanOutSink([log, later]);

    await expect(sink.publish(scope, eventFor(scope, 2))).rejects.toThrow();

    expect(await later.read(scope, 0)).toEqual([]);
  });

  it('RF-1006 a failing later sink is reported after the others were tried', async () => {
    const reached: string[] = [];
    const failing: RunEventSink = { publish: () => Promise.reject(new Error('page closed')) };
    const last: RunEventSink = {
      publish: () => {
        reached.push('last');
        return Promise.resolve();
      },
    };
    const sink = new FanOutSink([new MemoryEventSink(), failing, last]);

    await expect(sink.publish(scope, eventFor(scope, 1))).rejects.toThrow('page closed');

    expect(reached).toEqual(['last']);
  });
});

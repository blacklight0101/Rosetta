import { describe, expect, it } from 'vitest';
import { EventStream } from '../../../../src/presentation/web/event-stream.js';
import { eventFor, scopeFor } from '../../../support/run-event-fixtures.js';

// RF-1006: the back-pressure of the events stream. A page that does not read live events is
// dropped once more than 1 MiB waits; stored events are sent in batches that wait for the page, so
// a long history never trips that limit.

const scope = scopeFor('20261012-100000-scan');
const big = eventFor(scope, 1, 'agent.turn', { note: 'x'.repeat(100_000) });

describe('EventStream back-pressure', () => {
  it('RF-1006 drops a page that leaves more than 1 MiB of live events unread', () => {
    const stream = new EventStream();

    for (let seq = 1; seq <= 12; seq += 1) stream.send({ ...big, seq });

    expect(stream.destroyed).toBe(true);
  });

  it('RF-1006 does not drop a page for stored events, which it sends only as fast as they are read', async () => {
    const stream = new EventStream();
    let received = 0;
    stream.on('data', (chunk: Buffer) => {
      received += chunk.length;
    });

    for (let seq = 1; seq <= 40; seq += 1) {
      stream.sendStored({ ...big, seq });
      await stream.drained();
    }

    expect(stream.destroyed).toBe(false);
    expect(received).toBeGreaterThan(4_000_000);
  });

  it('RF-1006 stops waiting for a page that is gone', async () => {
    const stream = new EventStream();
    for (let seq = 1; seq <= 5; seq += 1) stream.sendStored({ ...big, seq });
    const waiting = stream.drained();

    stream.destroy();

    await expect(waiting).resolves.toBeUndefined();
    expect(stream.isFinished).toBe(true);
  });
});

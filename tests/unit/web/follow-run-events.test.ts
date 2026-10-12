import { describe, expect, it } from 'vitest';
import { followRunEvents, type StreamStatus } from '../../../web/src/api/follow-run-events.js';
import type { ApiFailure } from '../../../web/src/api/client.js';
import type { RunEvent } from '../../../web/src/api/run-events.js';
import { ev, runEnded, wire } from './live-run-fixtures.js';
import { StreamServer } from './stream-server.js';

// RF-1006, RF-1105: the follower of a run's event stream: stored events first, `Last-Event-ID` on
// a reconnect, no event twice, an end after `run.ended`, and no retry for a run that is not there.

interface Followed {
  readonly events: RunEvent[];
  readonly statuses: string[];
  readonly done: Promise<void>;
  readonly abort: () => void;
}

function follow(server: StreamServer): Followed {
  const events: RunEvent[] = [];
  const statuses: string[] = [];
  const abort = new AbortController();
  const done = followRunEvents({
    runId: 'run-uuid-1',
    send: server.send,
    signal: abort.signal,
    retryMs: 1,
    onEvent: (event) => {
      events.push(event);
    },
    onStatus: (status: StreamStatus, failure?: ApiFailure) => {
      statuses.push(
        failure === undefined ? status : `${status}:${String(failure.status)}:${failure.code}`,
      );
    },
  });
  return {
    events,
    statuses,
    done,
    abort: () => {
      abort.abort();
    },
  };
}

describe('followRunEvents', () => {
  it('RF-1006 asks for the stream of the run by its id, delivers the events in order and ends with run.ended', async () => {
    const server = new StreamServer();
    const followed = follow(server);
    const stream = await server.connection();

    stream.event(ev(1, 'run.started'));
    stream.event(ev(2, 'agent.planned'));
    stream.event(runEnded(3, 'Completed'));
    await followed.done;

    expect(server.requests).toEqual([{ path: '/api/runs/run-uuid-1/events', lastEventId: null }]);
    expect(followed.events.map((event) => event.seq)).toEqual([1, 2, 3]);
    expect(followed.statuses).toEqual(['connecting', 'open', 'ended']);
  });

  it('RF-1006 puts together a frame that arrives in pieces and skips comments and the retry line', async () => {
    const server = new StreamServer();
    const followed = follow(server);
    const stream = await server.connection();
    const frame = `id: 1\nevent: agent.turn\ndata: ${wire(ev(1, 'agent.turn'))}\n\n`;

    stream.raw('retry: 3000\n\n: keepalive\n\n');
    stream.raw(frame.slice(0, 30));
    stream.raw(frame.slice(30));
    stream.event(runEnded(2, 'Completed'));
    await followed.done;

    expect(followed.events.map((event) => event.seq)).toEqual([1, 2]);
  });
});

describe('followRunEvents after a break', () => {
  it('RF-1006 reconnects with the last event id when the stream breaks, and skips what it already has', async () => {
    const server = new StreamServer();
    const followed = follow(server);
    const first = await server.connection(0);
    first.event(ev(1, 'run.started'));
    first.event(ev(2, 'agent.turn'));
    first.end();

    const second = await server.connection(1);
    second.event(ev(2, 'agent.turn'));
    second.event(ev(3, 'agent.turn'));
    second.event(runEnded(4, 'Completed'));
    await followed.done;

    expect(server.requests.map((request) => request.lastEventId)).toEqual([null, '2']);
    expect(followed.events.map((event) => event.seq)).toEqual([1, 2, 3, 4]);
    expect(followed.statuses).toEqual(['connecting', 'open', 'reconnecting', 'open', 'ended']);
  });

  it('RF-1006 tries again after a failed connection and after a server error', async () => {
    const server = new StreamServer();
    server.answerNext('unreachable');
    server.answerNext({ status: 503 });
    const followed = follow(server);

    const stream = await server.connection();
    stream.event(runEnded(1, 'Completed'));
    await followed.done;

    expect(server.requests).toHaveLength(3);
    expect(followed.events.map((event) => event.seq)).toEqual([1]);
  });
});

describe('followRunEvents when the run is gone or the page leaves', () => {
  it('RF-1105 stops with the status for a run that is not there or not the user own', async () => {
    const server = new StreamServer();
    server.answerNext({ status: 404 });
    const followed = follow(server);

    await followed.done;

    expect(followed.statuses).toEqual(['connecting', 'failed:404:RST-2003']);
    expect(server.requests).toHaveLength(1);
  });

  it('RF-1006 stops without a word when the page goes away', async () => {
    const server = new StreamServer();
    const followed = follow(server);
    const stream = await server.connection();
    stream.event(ev(1, 'run.started'));

    followed.abort();
    await followed.done;

    expect(followed.events).toHaveLength(1);
    expect(followed.statuses).not.toContain('failed');
    expect(followed.statuses).not.toContain('reconnecting');
  });
});

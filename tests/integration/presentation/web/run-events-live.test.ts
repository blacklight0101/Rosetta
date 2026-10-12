import { afterEach, describe, expect, it, vi } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { connectSse, type SseConnection } from '../../../support/sse-client.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1006: the stream of a run that is still running, over a real loopback connection. Events
// reach the page as they happen after the stored ones; the stream closes when the run ends and when
// the client goes away, and leaves no listener or keep-alive job behind.

let current: TestServer | undefined;
let connection: SseConnection | undefined;

afterEach(async () => {
  connection?.abort();
  connection = undefined;
  await current?.server.close();
  current = undefined;
});

interface Live {
  readonly test: TestServer;
  readonly run: Run;
  readonly connect: () => Promise<SseConnection>;
}

async function openRun(): Promise<Live> {
  const test = createTestServer();
  current = test;
  const user = await addUser(test, { userName: 'amy' });
  const browser: TestBrowser = await signedInBrowser(test.server, user);
  const run = await test.runs.start(actorOf(user.account));
  const base = await test.server.listen({ host: '127.0.0.1', port: 0 });
  const cookie = [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  const connect = async (): Promise<SseConnection> => {
    connection = await connectSse(`${base}/api/runs/${run.id}/events`, { cookie });
    return connection;
  };
  return { test, run, connect };
}

describe('the live stream of a run', () => {
  it('RF-1006 sends the stored events first, then each new event, and closes after run.ended', async () => {
    const { test, run, connect } = await openRun();
    const stream = await connect();
    await stream.waitFor('event: run.started');
    expect(stream.status).toBe(200);
    expect(stream.contentType).toContain('text/event-stream');

    await test.runs.executor.started[0]?.events.emit('agent.turn', { turn: 1 });
    await stream.waitFor('event: agent.turn');
    test.runs.executor.settle(run.id, { endState: 'Completed' });
    await stream.ended;

    expect(stream.text()).toContain('event: run.ended');
    expect(test.runs.broadcaster.subscriberCount).toBe(0);
    expect(test.heartbeat.activeJobs).toBe(0);
  });

  it('RF-1006 frees the subscription and the keep-alive when the client disconnects', async () => {
    const { test, connect } = await openRun();
    const stream = await connect();
    await stream.waitFor('event: run.started');
    expect(test.runs.broadcaster.subscriberCount).toBe(1);
    expect(test.heartbeat.activeJobs).toBe(1);

    stream.abort();

    await vi.waitFor(() => {
      expect(test.runs.broadcaster.subscriberCount).toBe(0);
      expect(test.heartbeat.activeJobs).toBe(0);
    });
  });

  it('RF-1006 sends a keep-alive comment on every tick of the heartbeat', async () => {
    const { test, connect } = await openRun();
    const stream = await connect();
    await stream.waitFor('event: run.started');

    await test.heartbeat.tick();

    await stream.waitFor(': keepalive');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { connectSse, type SseConnection } from '../../../support/sse-client.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1101, P1-160: a sign-out that lands while the events route is still subscribing (after the
// session was checked, before the stream is answered) ends that stream too: the route answers 401
// and leaves no stream, subscription or keep-alive behind.

let current: TestServer | undefined;
let connection: SseConnection | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  connection?.abort();
  connection = undefined;
  await current?.server.close();
  current = undefined;
});

describe('an event stream and a sign-out during its subscription', () => {
  it('RF-1101 a sign-out while the stream subscribes ends it: 401, nothing left open', async () => {
    const test = createTestServer();
    current = test;
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);
    const run = await test.runs.start(actorOf(amy.account));
    const base = await test.server.listen({ host: '127.0.0.1', port: 0 });
    const cookie = [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
    const subscribe = test.runs.subscribe.execute.bind(test.runs.subscribe);
    const signedOut: number[] = [];
    vi.spyOn(test.runs.subscribe, 'execute').mockImplementation(async (request) => {
      const outcome = await browser.request({ method: 'DELETE', url: '/api/session' });
      signedOut.push(outcome.statusCode);
      return subscribe(request);
    });

    connection = await connectSse(`${base}/api/runs/${run.id}/events`, { cookie });

    expect(signedOut).toEqual([204]);
    expect(connection.status).toBe(401);
    await vi.waitFor(() => {
      expect(test.streams.size).toBe(0);
      expect(test.runs.broadcaster.subscriberCount).toBe(0);
      expect(test.heartbeat.activeJobs).toBe(0);
    });
  });

  it('RF-1105 an unknown run id answers 404 and leaves no stream in the registry', async () => {
    const test = createTestServer();
    current = test;
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);

    const url = '/api/runs/00000000-0000-4000-8000-00000000abcd/events';
    const response = await browser.request({ method: 'GET', url });

    expect(response.statusCode).toBe(404);
    expect(test.streams.size).toBe(0);
  });
});

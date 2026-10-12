import { afterEach, describe, expect, it, vi } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1006: when the stored events cannot be read, the events route frees everything it opened for
// the request (the stream, the subscription, the keep-alive) and does not hang.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function openRun(): Promise<{
  test: TestServer;
  get: () => Promise<{ statusCode: number }>;
}> {
  const test = createTestServer();
  current = test;
  const user = await addUser(test, { userName: 'amy' });
  const browser = await signedInBrowser(test.server, user);
  const run = await test.runs.start(actorOf(user.account));
  return {
    test,
    get: () => browser.request({ method: 'GET', url: `/api/runs/${run.id}/events` }),
  };
}

describe('GET /api/runs/:runId/events when the history cannot be read', () => {
  it('RF-1006 frees the stream when the last seq cannot be read, and answers with an error', async () => {
    const { test, get } = await openRun();
    vi.spyOn(test.runs.events, 'lastSeq').mockRejectedValue(new Error('disk gone'));

    const response = await get();

    expect(response.statusCode).toBe(500);
    expect(test.streams.size).toBe(0);
    expect(test.runs.broadcaster.subscriberCount).toBe(0);
    expect(test.heartbeat.activeJobs).toBe(0);
  });

  it('RF-1006 frees the stream, the subscription and the keep-alive when the replay fails', async () => {
    const { test, get } = await openRun();
    vi.spyOn(test.runs.events, 'replay').mockRejectedValue(new Error('disk gone'));

    await get().catch(() => undefined);

    await vi.waitFor(() => {
      expect(test.streams.size).toBe(0);
      expect(test.runs.broadcaster.subscriberCount).toBe(0);
      expect(test.heartbeat.activeJobs).toBe(0);
    });
  });
});

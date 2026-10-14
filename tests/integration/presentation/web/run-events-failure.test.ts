import { afterEach, describe, expect, it, vi } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { RosettaError } from '../../../../src/domain/errors/rosetta-error.js';
import { fakeValue } from '../../../support/fake-value.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1006: when the stored events cannot be read, the events route frees everything it opened for
// the request (the stream, the subscription, the keep-alive) and does not hang. RF-009, P1-160
// (F-12): a replay that fails is written to the application log with its code and the run, never
// the error's text (it can hold a path or a secret).

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function openRun(): Promise<{
  test: TestServer;
  runId: string;
  get: () => Promise<{ statusCode: number }>;
}> {
  const test = createTestServer();
  current = test;
  const user = await addUser(test, { userName: 'amy' });
  const browser = await signedInBrowser(test.server, user);
  const run = await test.runs.start(actorOf(user.account));
  return {
    test,
    runId: run.id,
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

/** A failure whose text holds a data-folder path and a (fake) key, as a file error could. */
const leakyText = `open /data/workspaces/u1/private-folder/events.jsonl ${['sk', 'proj', fakeValue(40)].join('-')}`;

describe('GET /api/runs/:runId/events replay failures in the application log', () => {
  it.each([
    [
      'a file error',
      Object.assign(new Error(leakyText), { code: 'ENOENT' }),
      ERROR_CODES.runEventLogFailed,
    ],
    [
      'a coded error',
      new RosettaError(ERROR_CODES.runEventRefused, leakyText),
      ERROR_CODES.runEventRefused,
    ],
  ])(
    'RF-009 %s during the replay is logged at error with its code and the run, without its text',
    async (_name, failure, code) => {
      const { test, runId, get } = await openRun();
      vi.spyOn(test.runs.events, 'replay').mockRejectedValue(failure);

      await get().catch(() => undefined);

      await vi.waitFor(() => {
        expect(test.logger.entries).toContainEqual(
          expect.objectContaining({ level: 'error', logger: 'http', code, runId }),
        );
      });
      const text = test.logger.text();
      expect(text).not.toContain('private-folder');
      expect(text).not.toContain(fakeValue(40));
    },
  );
});

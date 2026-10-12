import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { JsonlEventLog } from '../../../../src/infrastructure/events/jsonl-event-log.js';
import { NodeOutputWriter } from '../../../../src/infrastructure/files/node-output-writer.js';
import { SecretMasker } from '../../../../src/infrastructure/guards/secret-masker.js';
import type { MemoryLogger } from '../../../support/memory-logger.js';
import { fakeOpenAiKey } from '../../../support/secret-fixture.js';
import { useTempRoot } from '../../../support/temp-root.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1006, RF-1105, RNF-003: GET /api/runs/:id/events through the server, with a session. A run
// that has ended is replayed from its stored events and the stream closes; another user's run
// answers 404 like an unknown one; nothing in the stream is a secret.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface Setup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly root: TestBrowser;
  readonly runId: string;
}

async function setup(test: TestServer = createTestServer(), note = 'first turn'): Promise<Setup> {
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const rootUser = await addUser(test, { userName: 'root', role: 'admin' });
  const run = await test.runs.start(actorOf(amyUser.account));
  await test.runs.executor.started[0]?.events.emit('agent.turn', { turn: 1, note });
  test.runs.executor.settle(run.id, { endState: 'Completed' });
  await test.runs.ended(run);
  return {
    test,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
    root: await signedInBrowser(test.server, rootUser),
    runId: run.id,
  };
}

describe('GET /api/runs/:id/events', () => {
  it('RF-1006 replays the stored events of a finished run as server-sent events and ends', async () => {
    const { amy, runId } = await setup();

    const response = await amy.request({ method: 'GET', url: `/api/runs/${runId}/events` });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/event-stream');
    expect(response.headers['cache-control']).toBe('no-store');
    const frames = response.body.split('\n\n').filter((frame) => frame.includes('event: '));
    expect(frames.map((frame) => frame.split('\n').slice(0, 2))).toEqual([
      ['id: 1', 'event: run.started'],
      ['id: 2', 'event: agent.turn'],
      ['id: 3', 'event: run.ended'],
    ]);
    expect(response.body).toContain('"endState":"Completed"');
  });

  it('RF-1006 sends only the events after the one in Last-Event-ID', async () => {
    const { amy, runId } = await setup();

    const response = await amy.request({
      method: 'GET',
      url: `/api/runs/${runId}/events`,
      headers: { 'last-event-id': '2' },
    });

    expect(response.body).not.toContain('event: run.started');
    expect(response.body).not.toContain('event: agent.turn');
    expect(response.body).toContain('event: run.ended');
  });

  it('RF-007 refuses a Last-Event-ID that is not a number with 400', async () => {
    const { amy, runId } = await setup();

    const response = await amy.request({
      method: 'GET',
      url: `/api/runs/${runId}/events`,
      headers: { 'last-event-id': 'abc' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });

  it('RF-1105 answers 404 for another user run, an administrator and an unknown id', async () => {
    const { bob, root, amy, runId } = await setup();
    const url = (id: string): string => `/api/runs/${id}/events`;
    const unknown = '00000000-0000-4000-b000-00000000ffff';

    const answers = await Promise.all([
      bob.request({ method: 'GET', url: url(runId) }),
      root.request({ method: 'GET', url: url(runId) }),
      amy.request({ method: 'GET', url: url(unknown) }),
      amy.request({ method: 'GET', url: url('not-a-uuid') }),
    ]);

    for (const answer of answers) {
      expect(answer.statusCode).toBe(404);
      expect(answer.json()).toMatchObject({ code: ERROR_CODES.notFound });
    }
  });
});

describe('GET /api/runs/:id/events and secrets', () => {
  const data = useTempRoot('rosetta-sse-');

  it('RNF-003 keeps a secret out of the replayed stream', async () => {
    const eventStore = (logger: MemoryLogger): JsonlEventLog =>
      new JsonlEventLog({
        writer: new NodeOutputWriter({ dataDir: data.path, logger }),
        masker: new SecretMasker(),
      });
    const { amy, runId } = await setup(createTestServer({ eventStore }), fakeOpenAiKey);

    const response = await amy.request({ method: 'GET', url: `/api/runs/${runId}/events` });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('event: agent.turn');
    expect(response.body).not.toContain(fakeOpenAiKey);
  });
});

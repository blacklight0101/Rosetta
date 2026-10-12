import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1002, RF-1105, RF-1009: GET /api/runs/:runId gives the live run page what the event stream
// does not carry: the run's stage and queue state before its first event, the project it belongs
// to and the totals so far. Another user's run id answers 404 like an unknown one.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface Setup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly running: Run;
  readonly queued: Run;
}

async function setup(): Promise<Setup> {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const running = await test.runs.start(actorOf(amyUser.account));
  const queued = await test.runs.start(actorOf(amyUser.account));
  return {
    test,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
    running,
    queued,
  };
}

const runUrl = (run: Run): string => `/api/runs/${run.id}`;

describe('GET /api/runs/:runId', () => {
  it('RF-1002 shows a running run with its stage, project, folder name and totals', async () => {
    const { amy, running } = await setup();

    const response = await amy.request({ method: 'GET', url: runUrl(running) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: running.id,
      projectId: running.projectId,
      runId: running.runKey,
      stage: 'scan',
      queueState: 'Running',
      endState: null,
      totals: { costMicros: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 },
    });
    expect(response.body).not.toContain('userId');
    expect(response.body).not.toContain('snapshotKey');
  });

  it('RF-1108 shows a queued run as queued, before it has any event', async () => {
    const { amy, queued } = await setup();

    const response = await amy.request({ method: 'GET', url: runUrl(queued) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: queued.id, queueState: 'Queued', startedAt: null });
  });

  it('RF-003 shows an ended run with its end state', async () => {
    const { test, amy, running } = await setup();
    test.runs.executor.settle(running.id, { endState: 'Completed' });
    await test.runs.ended(running);

    const response = await amy.request({ method: 'GET', url: runUrl(running) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ queueState: 'Ended', endState: 'Completed' });
  });
});

describe('GET /api/runs/:runId and access', () => {
  it('RF-1105 answers 404 for another user run and for an id that is not a run', async () => {
    const { bob, running } = await setup();

    const other = await bob.request({ method: 'GET', url: runUrl(running) });
    const unknown = await bob.request({ method: 'GET', url: '/api/runs/not-a-uuid' });

    expect(other.statusCode).toBe(404);
    expect(other.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(unknown.statusCode).toBe(404);
  });

  it('RF-1009 answers 401 without a session', async () => {
    const { test, running } = await setup();

    const response = await new TestBrowser(test.server).request({
      method: 'GET',
      url: runUrl(running),
    });

    expect(response.statusCode).toBe(401);
  });
});

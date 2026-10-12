import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1108, RNF-002, RF-1105, RF-1009: POST /api/runs/:runId/stop through the server with a session,
// the public Origin and a CSRF token.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface Setup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  /** The run of amy that is running, and her next run, which waits (one run per user). */
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

const stopUrl = (run: Run): string => `/api/runs/${run.id}/stop`;

describe('POST /api/runs/:runId/stop', () => {
  it('RF-1108 aborts the signal of a running run and answers 202; the run then ends as Interrupted', async () => {
    const { test, amy, running } = await setup();
    test.runs.executor.started[0]?.signal.addEventListener('abort', () => {
      test.runs.executor.settle(running.id, { endState: 'Interrupted' });
    });

    const response = await amy.request({ method: 'POST', url: stopUrl(running) });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ id: running.id, stage: 'scan', stopRequested: true });
    expect(response.body).not.toContain('userId');
    expect((await test.runs.ended(running)).endState).toBe('Interrupted');
  });

  it('RF-1108 cancels a queued run and answers 200 with the run as ended', async () => {
    const { amy, queued } = await setup();

    const response = await amy.request({ method: 'POST', url: stopUrl(queued) });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: queued.id,
      queueState: 'Ended',
      endState: 'Interrupted',
      stopRequested: false,
    });
  });

  it('RF-003 answers 409 for a run that has already ended', async () => {
    const { test, amy, running } = await setup();
    test.runs.executor.settle(running.id, { endState: 'Completed' });
    await test.runs.ended(running);

    const response = await amy.request({ method: 'POST', url: stopUrl(running) });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.conflict });
  });
});

describe('POST /api/runs/:runId/stop and access', () => {
  it('RF-1105 answers 404 for another user run and leaves it running', async () => {
    const { test, bob, running } = await setup();

    const response = await bob.request({ method: 'POST', url: stopUrl(running) });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(test.runs.executor.signalOf(running.id)?.aborted).toBe(false);
  });

  it('RF-1009 answers 401 without a session', async () => {
    const { test, running } = await setup();

    const response = await new TestBrowser(test.server).request({
      method: 'POST',
      url: stopUrl(running),
    });

    expect(response.statusCode).toBe(401);
    expect(test.runs.executor.signalOf(running.id)?.aborted).toBe(false);
  });

  it('RF-1009 refuses a request without a CSRF token or from another origin', async () => {
    const { test, amy, running } = await setup();

    const noToken = await amy.request({ method: 'POST', url: stopUrl(running), csrf: false });
    const foreign = await amy.request({
      method: 'POST',
      url: stopUrl(running),
      origin: 'https://evil.example',
    });

    expect(noToken.statusCode).toBe(403);
    expect(noToken.json()).toMatchObject({ code: ERROR_CODES.csrfTokenInvalid });
    expect(foreign.statusCode).toBe(403);
    expect(foreign.json()).toMatchObject({ code: ERROR_CODES.originRefused });
    expect(test.runs.executor.signalOf(running.id)?.aborted).toBe(false);
  });
});

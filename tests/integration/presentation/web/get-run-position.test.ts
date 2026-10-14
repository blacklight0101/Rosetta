import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import type { Run } from '../../../../src/domain/runs/run.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1108, RF-1105 (P1-106): GET /api/runs/:runId gives a queued run its place in the server's queue
// (counted from 1, null for a run that is not queued), so the start page can show it moving while
// it waits. The place is the one the Projects page shows; another user's run answers 404.

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
  readonly first: Run;
  readonly second: Run;
}

async function setup(): Promise<Setup> {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const running = await test.runs.start(actorOf(amyUser.account));
  const first = await test.runs.start(actorOf(amyUser.account));
  const second = await test.runs.start(actorOf(bobUser.account));
  return {
    ...{ test, running, first, second },
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
  };
}

async function positionOf(browser: TestBrowser, run: Run): Promise<unknown> {
  const response = await browser.request({ method: 'GET', url: `/api/runs/${run.id}` });
  return response.json<{ position?: unknown }>().position;
}

describe('GET /api/runs/:runId: the place in the queue', () => {
  it('RF-1108 a queued run shows its place, counted from 1 in queue order', async () => {
    const { amy, bob, first, second } = await setup();

    expect(await positionOf(amy, first)).toBe(1);
    expect(await positionOf(bob, second)).toBe(2);
  });

  it('RF-1108 a running run has no place', async () => {
    const { amy, running } = await setup();

    expect(await positionOf(amy, running)).toBeNull();
  });

  it('RF-1108 the place moves up as the runs ahead end, and is null once the run starts', async () => {
    const { test, bob, running, first, second } = await setup();
    test.runs.executor.settle(running.id, { endState: 'Completed' });
    await test.runs.ended(running);
    await test.runs.queue.dispatch();

    expect(await positionOf(bob, second)).toBe(1);
    test.runs.executor.settle(first.id, { endState: 'Completed' });
    await test.runs.ended(first);
    await test.runs.queue.dispatch();
    expect(await positionOf(bob, second)).toBeNull();
  });

  it('RF-1105 another user cannot read the place of a run', async () => {
    const { bob, first } = await setup();

    const response = await bob.request({ method: 'GET', url: `/api/runs/${first.id}` });

    expect(response.statusCode).toBe(404);
  });
});

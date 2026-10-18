import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import type { RunEndState } from '../../../../src/domain/runs/run-states.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settledRun } from '../../../support/run-settled.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-209, RF-1105, RF-425: POST /api/runs/:runId/deepen/estimate and POST /api/runs/:runId/deepen
// through the server with a session, the public Origin and a CSRF token. The estimate starts
// nothing; the Deepen starts only on the owner's confirmation of a completed understand run.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup() {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const project = sampleProject({ userId: amyUser.account.id });
  await test.projects.insertOrFind(project);
  const amy = await signedInBrowser(test.server, amyUser);
  const bob = await signedInBrowser(test.server, bobUser);

  async function ended(stage: 'scan' | 'understand', endState: RunEndState): Promise<string> {
    const started = await amy.request({
      method: 'POST',
      url: `/api/projects/${project.id}/runs`,
      payload: { stage },
    });
    const { id } = started.json<{ id: string }>();
    test.runs.executor.settle(id, { endState });
    const run = await test.runs.runs.find(amyUser.account.id, id);
    if (run === undefined) throw new Error('The run vanished');
    await settledRun(test.runs, run);
    return id;
  }
  async function runCount(): Promise<number> {
    return (await test.runs.runs.list(amyUser.account.id, project.id)).length;
  }
  return { test, amy, bob, ended, runCount };
}

const deepenUrl = (runId: string): string => `/api/runs/${runId}/deepen`;

describe('POST /api/runs/:runId/deepen', () => {
  it('RF-209 starts the Deepen on the confirmation and answers 202 with a new understand run', async () => {
    const { amy, ended, runCount } = await setup();
    await ended('scan', 'Completed');
    const id = await ended('understand', 'Completed');

    const response = await amy.request({
      method: 'POST',
      url: deepenUrl(id),
      payload: { confirmed: true, maxRounds: 2 },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ stage: 'understand', endState: null });
    expect(response.json<{ id: string }>().id).not.toBe(id);
    expect(response.body).not.toContain('userId');
    expect(await runCount()).toBe(3);
  });

  it('RF-209 answers 400 RST-2309 without the confirmation and starts nothing', async () => {
    const { amy, ended, runCount } = await setup();
    const id = await ended('understand', 'Completed');

    const refused = await amy.request({
      method: 'POST',
      url: deepenUrl(id),
      payload: { confirmed: false },
    });

    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({ code: ERROR_CODES.deepenNotConfirmed });
    expect(await runCount()).toBe(1);
  });
});

describe('POST /api/runs/:runId/deepen, refusals', () => {
  it.each([
    ['a scan', 'scan', 'Completed'],
    ['an understand run that failed', 'understand', 'Failed'],
  ] as const)('RF-209 answers 409 RST-2308 for %s', async (_name, stage, endState) => {
    const { amy, ended } = await setup();
    const id = await ended(stage, endState);

    const refused = await amy.request({
      method: 'POST',
      url: deepenUrl(id),
      payload: { confirmed: true },
    });

    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: ERROR_CODES.runNotDeepenable });
  });
  it.each([{ confirmed: true, maxRounds: 6 }, { confirmed: true, extra: 1 }, {}])(
    'RF-209 answers 400 for the body %j',
    async (payload) => {
      const { amy, ended, runCount } = await setup();
      const id = await ended('understand', 'Completed');

      const refused = await amy.request({ method: 'POST', url: deepenUrl(id), payload });

      expect(refused.statusCode).toBe(400);
      expect(refused.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
      expect(await runCount()).toBe(1);
    },
  );
});

describe('POST /api/runs/:runId/deepen, who may', () => {
  it('RF-1105 answers 404 when another user asks to deepen the run, and starts nothing', async () => {
    const { bob, ended, runCount } = await setup();
    const id = await ended('understand', 'Completed');

    const refused = await bob.request({
      method: 'POST',
      url: deepenUrl(id),
      payload: { confirmed: true },
    });

    expect(refused.statusCode).toBe(404);
    expect(refused.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(await runCount()).toBe(1);
  });
});

describe('POST /api/runs/:runId/deepen/estimate', () => {
  it('RF-209 answers 200 with the round and all rounds against the cap, and starts nothing', async () => {
    const { amy, ended, runCount } = await setup();
    await ended('scan', 'Completed');
    const id = await ended('understand', 'Completed');

    const response = await amy.request({
      method: 'POST',
      url: `${deepenUrl(id)}/estimate`,
      payload: { maxRounds: 4 },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ round: unknown; allRounds: unknown; maxRounds: number }>();
    expect(body).toMatchObject({ maxRounds: 4, coveragePass: true, currency: 'USD' });
    expect(body).toHaveProperty('round.high.costMicros');
    expect(body).toHaveProperty('allRounds.high.costMicros');
    expect(body).toHaveProperty('overCap');
    expect(await runCount()).toBe(2);
  });

  it('RF-1105 answers 404 when another user asks for the estimate', async () => {
    const { bob, ended } = await setup();
    await ended('scan', 'Completed');
    const id = await ended('understand', 'Completed');

    const refused = await bob.request({ method: 'POST', url: `${deepenUrl(id)}/estimate` });

    expect(refused.statusCode).toBe(404);
  });
});

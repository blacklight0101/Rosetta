import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settledRun } from '../../../support/run-settled.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-231, RF-209, RF-1105: GET /api/runs/:runId/understanding through the server with a session. The
// test server's runs leave no task results, so an ended understand run has no measures to show yet.

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
  const started = await amy.request({
    method: 'POST',
    url: `/api/projects/${project.id}/runs`,
    payload: { stage: 'understand' },
  });
  const { id } = started.json<{ id: string }>();
  test.runs.executor.settle(id, { endState: 'Completed' });
  const run = await test.runs.runs.find(amyUser.account.id, id);
  if (run === undefined) throw new Error('The run vanished');
  await settledRun(test.runs, run);
  return { amy, bob, id };
}

describe('GET /api/runs/:runId/understanding', () => {
  it('RF-231 answers 200 with no measures and no Deepen record for a run that left no results', async () => {
    const { amy, id } = await setup();

    const response = await amy.request({ method: 'GET', url: `/api/runs/${id}/understanding` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ measures: null, deepen: null });
  });

  it('RF-1105 answers 404 when another user asks, like an unknown run', async () => {
    const { bob, id } = await setup();

    const response = await bob.request({ method: 'GET', url: `/api/runs/${id}/understanding` });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { settledRun } from '../../../support/run-settled.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-132, RF-143, DEC-148: POST /api/runs/:runId/deepen on an uploaded project whose roles use a
// cloud provider needs `privateCodeConfirmed: true` besides `cloudConsent: true`.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const cloudReader = settingsFor({ reader: { provider: 'openai', model: 'gpt-5-mini' } });

async function setup() {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const owner = { userId: amyUser.account.id, settings: cloudReader };
  const project = sampleProject({ ...owner, sourceKind: 'upload', sourceUrl: '' });
  await test.projects.insertOrFind(project);
  const amy = await signedInBrowser(test.server, amyUser);
  const started = await amy.request({
    method: 'POST',
    url: `/api/projects/${project.id}/runs`,
    payload: { stage: 'understand', cloudConsent: true, privateCodeConfirmed: true },
  });
  const { id } = started.json<{ id: string }>();
  test.runs.executor.settle(id, { endState: 'Completed' });
  const run = await test.runs.runs.find(amyUser.account.id, id);
  if (run === undefined) throw new Error('The run vanished');
  await settledRun(test.runs, run);
  return { amy, url: `/api/runs/${id}/deepen` };
}

describe('POST /api/runs/:runId/deepen and the private code of an upload', () => {
  it('RF-132 refuses a Deepen without the confirmation with RST-1521 (400)', async () => {
    const { amy, url } = await setup();

    const response = await amy.request({
      method: 'POST',
      url,
      payload: { confirmed: true, cloudConsent: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.privateCodeNotConfirmed });
  });

  it('RF-132 accepts it with both confirmations', async () => {
    const { amy, url } = await setup();

    const response = await amy.request({
      method: 'POST',
      url,
      payload: { confirmed: true, cloudConsent: true, privateCodeConfirmed: true },
    });

    expect(response.statusCode).toBe(202);
  });
});

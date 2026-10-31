import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-430, RF-431, DEC-196: POST /api/projects/:id/runs refuses a run whose roles have no usable key
// before it is queued, and records the amount the user approved on the start button.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const startUrl = (projectId: string): string => `/api/projects/${projectId}/runs`;

async function signedIn(serverKeysAllowed: boolean, settings = settingsFor({})) {
  const test = createTestServer();
  current = test;
  const user = await addUser(test, { userName: 'carl', serverKeysAllowed });
  const project = sampleProject({ userId: user.account.id, settings });
  await test.projects.insertOrFind(project);
  return { test, user, project, browser: await signedInBrowser(test.server, user) };
}

describe('POST /api/projects/:id/runs and the keys (RF-431)', () => {
  const cloudReader = settingsFor({ reader: { provider: 'openai', model: 'gpt-5-mini' } });

  it('RF-431 refuses a run whose roles have no usable key with RST-2302 (409) and records no run', async () => {
    const { test, user, project, browser } = await signedIn(false, cloudReader);

    const response = await browser.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', cloudConsent: true },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.providerKeyMissing });
    expect(test.runs.executor.started).toHaveLength(0);
    expect(await test.runs.runs.list(user.account.id, project.id)).toEqual([]);
  });

  it('RF-430 records the approved amount the start button sent', async () => {
    const { test, project, browser } = await signedIn(true);

    const response = await browser.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', approvedAmount: { tokens: 2_600_000, costMicros: 0 } },
    });

    expect(response.statusCode).toBe(202);
    expect(test.runs.executor.started[0]?.manifest.options).toEqual({
      cloudConsent: false,
      approvedAmount: { tokens: 2_600_000, costMicros: 0 },
    });
  });
});

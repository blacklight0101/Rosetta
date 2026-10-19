import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-132, RF-157, DEC-150: POST /api/projects/:id/runs on a project of kind `workbook` whose roles
// would send cell values, formulas or macros to a cloud provider needs `privateCodeConfirmed: true`
// besides the cloud consent; without it the request is refused with RST-1521 before any run exists.

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
  const userId = actorOf(amyUser.account).userId;
  const project = sampleProject({
    ...{ userId, settings: cloudReader, sourceKind: 'workbook' },
    ...{ sourceUrl: '', ref: '', subpath: '' },
  });
  await test.projects.insertOrFind(project);
  return { test, project, amy: await signedInBrowser(test.server, amyUser), userId };
}

const startUrl = (projectId: string): string => `/api/projects/${projectId}/runs`;

describe('POST /api/projects/:id/runs for a workbook project with a cloud role', () => {
  it('RF-157 refuses a start without the second confirmation with RST-1521 (400) and creates no run', async () => {
    const { test, amy, project, userId } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', cloudConsent: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: ERROR_CODES.privateCodeNotConfirmed,
      ...describeError(ERROR_CODES.privateCodeNotConfirmed),
    });
    expect(test.runs.executor.started).toHaveLength(0);
    expect(await test.runs.runs.list(userId, project.id)).toEqual([]);
  });

  it('RF-157 accepts a start with both confirmations', async () => {
    const { test, amy, project } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', cloudConsent: true, privateCodeConfirmed: true },
    });

    expect(response.statusCode).toBe(202);
    expect(test.runs.executor.started).toHaveLength(1);
  });

  it('RF-157 shows the workbook kind of the project, which the start page needs', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({ method: 'GET', url: `/api/projects/${project.id}` });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: project.id, sourceKind: 'workbook' });
  });
});

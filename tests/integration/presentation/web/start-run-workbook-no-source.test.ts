import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-150, RF-152: POST /api/projects/:id/runs on a project of kind `workbook` that holds no source yet
// is refused with RST-1920 (409) for a scan and for an understand run, and no run is created. The
// page holds Start off, but the server does not rely on that.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup() {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const userId = actorOf(amyUser.account).userId;
  const project = sampleProject({
    ...{ userId, sourceKind: 'workbook', sourceUrl: '', ref: '', subpath: '' },
    upload: undefined,
  });
  await test.projects.insertOrFind(project);
  return { test, project, amy: await signedInBrowser(test.server, amyUser), userId };
}

describe('POST /api/projects/:id/runs for a workbook project with no source', () => {
  it.each([
    [{ stage: 'scan' }],
    [{ stage: 'understand', cloudConsent: true, privateCodeConfirmed: true }],
  ])('RF-150 refuses %j with RST-1920 (409) and creates no run', async (payload) => {
    const { test, amy, project, userId } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: `/api/projects/${project.id}/runs`,
      payload,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      code: ERROR_CODES.projectNoSource,
      ...describeError(ERROR_CODES.projectNoSource),
    });
    expect(test.runs.executor.started).toHaveLength(0);
    expect(await test.runs.runs.list(userId, project.id)).toEqual([]);
  });
});

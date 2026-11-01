import { afterEach, describe, expect, it } from 'vitest';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-436, RF-1022, DEC-204: the web pages send no stage and no caps, but the run-start API keeps its
// stage parameter for the evaluation tools and the administrator, under the same checks.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function setup() {
  const test = createTestServer();
  current = test;
  const user = await addUser(test, { userName: 'amy' });
  const other = await addUser(test, { userName: 'bob' });
  const project = sampleProject({ userId: user.account.id });
  await test.projects.insertOrFind(project);
  return {
    project,
    amy: await signedInBrowser(test.server, user),
    bob: await signedInBrowser(test.server, other),
  };
}

const url = (projectId: string): string => `/api/projects/${projectId}/runs`;

describe('POST /api/projects/:id/runs with a stage', () => {
  it('RF-436 starts the single stage the caller names, with no caps and no journey amount', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: url(project.id),
      payload: { stage: 'scan' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json<{ stage: string }>().stage).toBe('scan');
  });

  it('RF-436 starts a single understand run on the named areas', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: url(project.id),
      payload: { stage: 'understand', areas: ['Catalog'], cloudConsent: false },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json<{ stage: string }>().stage).toBe('understand');
  });

  it("RF-436 the same ownership check applies: another user's project answers 404", async () => {
    const { bob, project } = await setup();

    const response = await bob.request({
      method: 'POST',
      url: url(project.id),
      payload: { stage: 'scan' },
    });

    expect(response.statusCode).toBe(404);
  });
});

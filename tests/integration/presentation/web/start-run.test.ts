import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-003, RF-1108, RF-1105, RF-1009: POST /api/projects/:id/runs through the server with a session,
// the public Origin and a CSRF token.

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
  return {
    test,
    project,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
    amyActor: actorOf(amyUser.account),
  };
}

const startUrl = (projectId: string): string => `/api/projects/${projectId}/runs`;

describe('POST /api/projects/:id/runs', () => {
  it('RF-1108 accepts a scan run: 202 with the run, started at once when the queue has room', async () => {
    const { test, amy, project } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'scan' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({
      projectId: project.id,
      stage: 'scan',
      queueState: 'Running',
      position: null,
    });
    expect(response.body).not.toContain('userId');
    expect(test.runs.executor.started).toHaveLength(1);
  });

  it('RF-1108 answers a second run of the same user as queued, with its position', async () => {
    const { amy, project } = await setup();
    await amy.request({ method: 'POST', url: startUrl(project.id), payload: { stage: 'scan' } });

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'scan' },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ queueState: 'Queued', position: 1 });
  });
});

describe('POST /api/projects/:id/runs and refused requests', () => {
  it('RF-1108 refuses a stage whose use case has not landed with RST-2305 (409)', async () => {
    const { test, amy, project } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'report' },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.runStageNotAvailable });
    expect(test.runs.executor.started).toHaveLength(0);
  });

  it('RF-1108 refuses a body with an unknown stage or extra fields with RST-2000 (400)', async () => {
    const { amy, project } = await setup();

    const unknown = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'deploy' },
    });
    const extra = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'scan', userId: 'someone-else' },
    });
    const missing = await amy.request({ method: 'POST', url: startUrl(project.id), payload: {} });

    for (const response of [unknown, extra, missing]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    }
  });
});

describe('POST /api/projects/:id/runs for understand', () => {
  const cloudReader = settingsFor({ reader: { provider: 'openai', model: 'gpt-5-mini' } });

  it('RF-200 accepts an understand run with its areas and the consent field', async () => {
    const { test, amy, project } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', areas: ['Catalog'], cloudConsent: false },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ stage: 'understand' });
    expect(test.runs.executor.started[0]?.manifest.options).toEqual({
      areas: ['Catalog'],
      cloudConsent: false,
    });
  });

  it('RF-143 refuses a cloud run without the consent field with RST-1515 (400) and starts nothing', async () => {
    const { test, amy, amyActor } = await setup();
    const cloud = sampleProject({ userId: amyActor.userId, settings: cloudReader });
    await test.projects.insertOrFind(cloud);

    const response = await amy.request({
      method: 'POST',
      url: startUrl(cloud.id),
      payload: { stage: 'understand' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
    expect(test.runs.executor.started).toHaveLength(0);
    expect(await test.runs.runs.list(amyActor.userId, cloud.id)).toEqual([]);
  });

  it('RF-200 refuses an area list that is not a list of names with RST-2000 (400)', async () => {
    const { amy, project } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', areas: 'Catalog' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });
});

describe('POST /api/projects/:id/runs and access', () => {
  it('RF-1105 answers 404 for another user project and starts nothing', async () => {
    const { test, bob, project } = await setup();

    const response = await bob.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'scan' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(test.runs.executor.started).toHaveLength(0);
  });

  it('RF-1009 answers 401 without a session', async () => {
    const { test, project } = await setup();

    const response = await new TestBrowser(test.server).request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'scan' },
    });

    expect(response.statusCode).toBe(401);
    expect(test.runs.executor.started).toHaveLength(0);
  });

  it('RF-1009 refuses a request without a CSRF token or from another origin', async () => {
    const { test, amy, project } = await setup();

    const noToken = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'scan' },
      csrf: false,
    });
    const foreign = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'scan' },
      origin: 'https://evil.example',
    });

    expect(noToken.statusCode).toBe(403);
    expect(foreign.statusCode).toBe(403);
    expect(test.runs.executor.started).toHaveLength(0);
  });
});

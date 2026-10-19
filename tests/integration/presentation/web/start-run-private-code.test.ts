import { heldZip } from '../../../support/upload-run-fixtures.js';
import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import type { SourceKind } from '../../../../src/domain/sources/source-kind.js';
import { settingsFor } from '../../../support/provider-factory-harness.js';
import { sampleProject } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-132, RF-143, DEC-148: POST /api/projects/:id/runs on a project of kind `upload` whose roles
// would send code to a cloud provider needs the second confirmation `privateCodeConfirmed: true`
// besides the cloud consent; without it the request is refused before any run exists.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const cloudReader = settingsFor({ reader: { provider: 'openai', model: 'gpt-5-mini' } });
const localRoles = settingsFor({
  reader: { provider: 'fake', model: 'fake-model' },
  verifier: { provider: 'fake', model: 'fake-model' },
  summariser: { provider: 'fake', model: 'fake-model' },
});

async function setup(kind: SourceKind, settings = cloudReader) {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const userId = actorOf(amyUser.account).userId;
  const project =
    kind === 'upload'
      ? sampleProject({ userId, settings, sourceKind: 'upload', sourceUrl: '', upload: heldZip })
      : sampleProject({ userId, settings });
  await test.projects.insertOrFind(project);
  return { test, project, amy: await signedInBrowser(test.server, amyUser), userId };
}

const startUrl = (projectId: string): string => `/api/projects/${projectId}/runs`;

describe('POST /api/projects/:id/runs for an uploaded project with a cloud role', () => {
  it('RF-132 refuses a start without the field with RST-1521 (400) and creates no run', async () => {
    const { test, amy, project, userId } = await setup('upload');

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

  it('RF-132 refuses the field set to false', async () => {
    const { test, amy, project } = await setup('upload');

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', cloudConsent: true, privateCodeConfirmed: false },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.privateCodeNotConfirmed });
    expect(test.runs.executor.started).toHaveLength(0);
  });
});

describe('POST /api/projects/:id/runs and a second confirmation that is not a true boolean', () => {
  it.each(['true', 1, null, 'yes'])(
    'RF-132 refuses the field %j: only a real boolean true counts',
    async (value) => {
      const { test, amy, project } = await setup('upload');

      const response = await amy.request({
        method: 'POST',
        url: startUrl(project.id),
        payload: { stage: 'understand', cloudConsent: true, privateCodeConfirmed: value },
      });

      expect(response.statusCode).toBe(400);
      expect(test.runs.executor.started).toHaveLength(0);
    },
  );

  it('RF-132 keeps the RF-143 refusal first: no cloud consent answers RST-1515 even with the field', async () => {
    const { amy, project } = await setup('upload');

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', privateCodeConfirmed: true },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.cloudConsentMissing });
  });
});

describe('POST /api/projects/:id/runs with both confirmations', () => {
  it('RF-132 accepts a start with both confirmations', async () => {
    const { test, amy, project } = await setup('upload');

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', cloudConsent: true, privateCodeConfirmed: true },
    });

    expect(response.statusCode).toBe(202);
    expect(test.runs.executor.started).toHaveLength(1);
  });
});

describe('POST /api/projects/:id/runs where no second confirmation is asked', () => {
  it('RF-132 an uploaded project whose roles are all local starts without the field', async () => {
    const { test, amy, project } = await setup('upload', localRoles);

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand' },
    });

    expect(response.statusCode).toBe(202);
    expect(test.runs.executor.started).toHaveLength(1);
  });

  it('RF-132 a GitHub project with a cloud role starts with the cloud consent alone', async () => {
    const { test, amy, project } = await setup('github');

    const response = await amy.request({
      method: 'POST',
      url: startUrl(project.id),
      payload: { stage: 'understand', cloudConsent: true },
    });

    expect(response.statusCode).toBe(202);
    expect(test.runs.executor.started[0]?.manifest.options).toEqual({ cloudConsent: true });
  });
});

describe('GET /api/projects/:id and the source kind', () => {
  it.each(['github', 'upload'] as const)(
    'RF-132 shows the %s kind of the project, which the start page needs',
    async (kind) => {
      const { amy, project } = await setup(kind);

      const response = await amy.request({ method: 'GET', url: `/api/projects/${project.id}` });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({ id: project.id, sourceKind: kind });
    },
  );
});

import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { settingsWith, templateSettings } from '../../../support/project-fixtures.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-010, RF-002, RF-1105, RF-1109: the projects API (`/api/projects`, `/api/projects/:id`,
// `/api/projects/:id/settings`, `/api/admin/users/:id/projects`) through the server with memory
// adapters, a session, the public Origin and a CSRF token.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface Setup {
  readonly test: TestServer;
  readonly amy: TestBrowser;
  readonly bob: TestBrowser;
  readonly root: TestBrowser;
  readonly amyId: string;
}

async function setup(): Promise<Setup> {
  const test = createTestServer();
  current = test;
  const amyUser = await addUser(test, { userName: 'amy' });
  const bobUser = await addUser(test, { userName: 'bob' });
  const rootUser = await addUser(test, { userName: 'root', role: 'admin' });
  return {
    test,
    amy: await signedInBrowser(test.server, amyUser),
    bob: await signedInBrowser(test.server, bobUser),
    root: await signedInBrowser(test.server, rootUser),
    amyId: amyUser.account.id,
  };
}

const repository = 'https://github.com/owner/repo';

async function createdId(browser: TestBrowser, url = repository): Promise<string> {
  const response = await browser.request({
    method: 'POST',
    url: '/api/projects',
    payload: { url },
  });
  const body: unknown = response.json();
  const id: unknown =
    typeof body === 'object' && body !== null ? Reflect.get(body, 'id') : undefined;
  if (typeof id !== 'string') throw new Error(`The project was not created: ${response.body}`);
  return id;
}

describe('POST /api/projects', () => {
  it('RF-010 a public GitHub URL creates a project with default settings and answers 201', async () => {
    const { amy } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { url: `${repository}/tree/main/src` },
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      name: 'owner/repo',
      sourceUrl: repository,
      ref: 'main',
      subpath: 'src',
      settings: JSON.parse(JSON.stringify(templateSettings)),
      createdAt: '2026-10-11T09:00:00.000Z',
      updatedAt: '2026-10-11T09:00:00.000Z',
    });
  });

  it('RF-010 the same URL again answers 200 with the existing project', async () => {
    const { amy } = await setup();
    const id = await createdId(amy);

    const again = await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { url: `${repository}/` },
    });

    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ id });
    const list = await amy.request({ method: 'GET', url: '/api/projects' });
    expect(list.json()).toMatchObject({ projects: [{ id }] });
  });

  it('RF-010 a URL that is not a public GitHub repository answers 400 with the code and reason at the url field', async () => {
    const { amy } = await setup();

    const response = await amy.request({
      method: 'POST',
      url: '/api/projects',
      payload: { url: 'https://example.com/owner/repo' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      code: ERROR_CODES.githubUrlInvalid,
      ...describeError(ERROR_CODES.githubUrlInvalid),
      problems: [
        {
          field: 'url',
          code: ERROR_CODES.githubUrlInvalid,
          ...describeError(ERROR_CODES.githubUrlInvalid),
          reason: 'The address is not on github.com.',
        },
      ],
    });
    const list = await amy.request({ method: 'GET', url: '/api/projects' });
    expect(list.json()).toEqual({ projects: [] });
  });

  it.each([[{}], [{ url: 5 }], [{ url: 'https://github.com/o/r', extra: 1 }], [[]]])(
    'RF-010 the body %j answers 400 RST-2000',
    async (payload) => {
      const { amy } = await setup();

      const response = await amy.request({ method: 'POST', url: '/api/projects', payload });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    },
  );
});

describe('GET /api/projects and /api/projects/:id', () => {
  it('RF-010 and RF-1105 a project appears only in the list of its owner', async () => {
    const { amy, bob } = await setup();
    const id = await createdId(amy);

    const mine = await amy.request({ method: 'GET', url: '/api/projects' });
    const theirs = await bob.request({ method: 'GET', url: '/api/projects' });

    expect(mine.json()).toMatchObject({ projects: [{ id, name: 'owner/repo' }] });
    expect(theirs.json()).toEqual({ projects: [] });
  });

  it('RF-1105 another user asking for the project answers 404 exactly like an unknown id', async () => {
    const { amy, bob } = await setup();
    const id = await createdId(amy);

    const own = await amy.request({ method: 'GET', url: `/api/projects/${id}` });
    const foreign = await bob.request({ method: 'GET', url: `/api/projects/${id}` });
    const unknown = await bob.request({
      method: 'GET',
      url: '/api/projects/00000000-0000-4000-a000-00000000ffff',
    });
    const malformed = await bob.request({ method: 'GET', url: '/api/projects/not-a-uuid' });

    expect(own.statusCode).toBe(200);
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({
      code: ERROR_CODES.notFound,
      ...describeError(ERROR_CODES.notFound),
    });
    expect(unknown.json()).toEqual(foreign.json());
    expect(malformed.statusCode).toBe(404);
  });
});

describe('PUT /api/projects/:id/settings', () => {
  it('RF-002 valid settings are saved and shown on the next read', async () => {
    const { amy } = await setup();
    const id = await createdId(amy);
    const settings = settingsWith({ 'budget.run.maxCostMicros': 100_000 });

    const response = await amy.request({
      method: 'PUT',
      url: `/api/projects/${id}/settings`,
      payload: settings,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id, settings });
    const read = await amy.request({ method: 'GET', url: `/api/projects/${id}` });
    expect(read.json()).toMatchObject({ settings });
  });

  it('RF-002 each problem is shown with its field and error code, and nothing is saved', async () => {
    const { amy } = await setup();
    const id = await createdId(amy);
    const settings = settingsWith({
      'budget.run.maxTokens': -1,
      'providers.ollama.baseUrl': 'http://localhost:11434',
      'roles.reader.model': '',
    });

    const response = await amy.request({
      method: 'PUT',
      url: `/api/projects/${id}/settings`,
      payload: settings,
    });

    expect(response.statusCode).toBe(400);
    const body: unknown = response.json();
    expect(body).toMatchObject({ code: ERROR_CODES.settingsInvalid });
    expect(body).toMatchObject({
      problems: [
        { field: 'budget.run.maxTokens', code: ERROR_CODES.settingsCapNegative },
        { field: 'providers.ollama.baseUrl', code: ERROR_CODES.settingsBaseUrlRefused },
        { field: 'roles.reader.model', code: ERROR_CODES.settingsModelMissing },
      ],
    });
    const read = await amy.request({ method: 'GET', url: `/api/projects/${id}` });
    expect(read.json()).toMatchObject({
      settings: JSON.parse(JSON.stringify(templateSettings)),
    });
  });

  it('RF-1105 another user cannot change the settings and gets 404', async () => {
    const { amy, bob } = await setup();
    const id = await createdId(amy);

    const response = await bob.request({
      method: 'PUT',
      url: `/api/projects/${id}/settings`,
      payload: settingsWith({}),
    });

    expect(response.statusCode).toBe(404);
  });

  it('RF-1009 a change without the CSRF token is refused', async () => {
    const { amy } = await setup();
    const id = await createdId(amy);

    const response = await amy.request({
      method: 'PUT',
      url: `/api/projects/${id}/settings`,
      payload: settingsWith({}),
      csrf: false,
    });

    expect(response.statusCode).toBe(403);
  });
});

describe('GET /api/admin/users/:id/projects', () => {
  it('RF-1105 the administrator reads another workspace and an audit event is written', async () => {
    const { test, amy, root, amyId } = await setup();
    const id = await createdId(amy);

    const response = await root.request({
      method: 'GET',
      url: `/api/admin/users/${amyId}/projects`,
      remoteAddress: '203.0.113.5',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      owner: { id: amyId, userName: 'amy' },
      projects: [{ id, name: 'owner/repo' }],
    });
    const events = await test.audit.list({ since: new Date(0), action: 'admin.workspace_opened' });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ targetId: amyId, ip: '203.0.113.5', outcome: 'ok' });
  });

  it('RF-1105 a user who is not an administrator answers 403 and nothing is read', async () => {
    const { test, bob, amyId } = await setup();

    const response = await bob.request({
      method: 'GET',
      url: `/api/admin/users/${amyId}/projects`,
    });

    expect(response.statusCode).toBe(403);
    const events = await test.audit.list({ since: new Date(0), action: 'admin.workspace_opened' });
    expect(events).toEqual([]);
  });

  it('RF-1105 an unknown user answers 404 to the administrator', async () => {
    const { root } = await setup();

    const response = await root.request({
      method: 'GET',
      url: '/api/admin/users/00000000-0000-4000-9000-00000000ffff/projects',
    });

    expect(response.statusCode).toBe(404);
  });
});

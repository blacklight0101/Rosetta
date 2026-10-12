import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { InjectOptions } from 'fastify';
import { actorOf } from '../../src/domain/accounts/actor.js';
import { fixturePassword } from '../support/account-fixtures.js';
import { completedScan } from '../support/estimate-harness.js';
import { sampleProject, settingsWith } from '../support/project-fixtures.js';
import { fixtureKey, sampleKeyRecord } from '../support/provider-key-fixtures.js';
import { addUser, signedInBrowser, TestBrowser, type TestUser } from '../support/test-browser.js';
import {
  active,
  adminOnly,
  columns,
  everyone,
  ownerOnly,
  signedIn,
  type Column,
} from '../support/access-columns.js';
import { budgetRoutes, outputRoutes, type Context, type Probe } from '../support/access-probes.js';
import { createTestServer, type TestServer } from '../support/web-server.js';

// RF-1105, RF-1009, conventions section 7: every route has a row in the access matrix with the
// answer for anonymous, a user, another user, an administrator and an administrator whose password
// must be changed (RF-1102: only the session API, the change-password route and page, and public
// routes answer; other pages redirect to /account/password and other API routes answer 403). The
// routes are read from the server itself (with the static front end mounted), so a new route
// without a row fails this test.

const staticRoot = fileURLToPath(new URL('../fixtures/static-site/', import.meta.url));
const ownCredentials = (user: TestUser | undefined): InjectOptions['payload'] => ({
  userName: user?.account.userName ?? 'nobody',
  password: user?.password ?? fixturePassword('Anonymous'),
});

const unknownUser = '00000000-0000-4000-9000-00000000ffff';
const projectUrl = (suffix: string) => (context: Context) =>
  `/api/projects/${context.projectId}${suffix}`;
const workspaceUrl = (userId: (context: Context) => string) => (context: Context) =>
  `/api/admin/users/${userId(context)}/projects`;
const runUrl = (suffix: string, pick: (context: Context) => string) => (context: Context) =>
  `/api/runs/${pick(context)}${suffix}`;
const adminUserUrl = (suffix: string, userId: (context: Context) => string) => (context: Context) =>
  `/api/admin/users/${userId(context)}${suffix}`;
// RF-1200: the landing page shows itself to a visitor and sends every signed-in user to /projects.
const landing = { ...everyone(302), anonymous: 200 };
const newPassword = fixturePassword('Renewed');
const keysUrl = '/api/account/keys';

/** One row per route (method and path as Fastify prints them), with one or more probes. */
const matrix: Readonly<Record<string, readonly Probe[]>> = {
  'GET /healthz': [{ method: 'GET', url: '/healthz', expected: everyone(200) }],
  'HEAD /healthz': [{ method: 'HEAD', url: '/healthz', expected: everyone(200) }],
  'GET /': [{ method: 'GET', url: '/', expected: landing }],
  'HEAD /': [{ method: 'HEAD', url: '/', expected: landing }],
  'GET /robots.txt': [{ method: 'GET', url: '/robots.txt', expected: everyone(200) }],
  'HEAD /robots.txt': [{ method: 'HEAD', url: '/robots.txt', expected: everyone(200) }],
  'POST /api/session': [
    {
      method: 'POST',
      url: '/api/session',
      payload: ownCredentials,
      expected: signedIn(401, 200),
    },
  ],
  'GET /api/session': [{ method: 'GET', url: '/api/session', expected: signedIn(401, 200) }],
  'HEAD /api/session': [{ method: 'HEAD', url: '/api/session', expected: signedIn(401, 200) }],
  'DELETE /api/session': [{ method: 'DELETE', url: '/api/session', expected: signedIn(401, 204) }],
  'POST /api/projects': [
    {
      method: 'POST',
      url: '/api/projects',
      payload: () => ({ url: 'https://github.com/owner/new-repo' }),
      expected: active(401, 201),
    },
  ],
  'GET /api/projects': [{ method: 'GET', url: '/api/projects', expected: active(401, 200) }],
  'HEAD /api/projects': [{ method: 'HEAD', url: '/api/projects', expected: active(401, 200) }],
  'GET /api/projects/:id': [
    { method: 'GET', url: projectUrl(''), expected: ownerOnly(200) },
    { method: 'GET', url: () => '/api/projects/not-a-uuid', expected: active(401, 404) },
  ],
  'HEAD /api/projects/:id': [{ method: 'HEAD', url: projectUrl(''), expected: ownerOnly(200) }],
  'PUT /api/projects/:id/settings': [
    {
      method: 'PUT',
      url: projectUrl('/settings'),
      payload: () => settingsWith({}),
      expected: ownerOnly(200),
    },
  ],
  'POST /api/projects/:id/runs': [
    {
      method: 'POST',
      url: projectUrl('/runs'),
      payload: () => ({ stage: 'scan' }),
      expected: ownerOnly(202),
    },
    {
      method: 'POST',
      url: () => '/api/projects/not-a-uuid/runs',
      payload: () => ({ stage: 'scan' }),
      expected: active(401, 404),
    },
  ],
  'GET /api/projects/:id/estimate': [
    { method: 'GET', url: projectUrl('/estimate'), expected: ownerOnly(200) },
    { method: 'GET', url: () => '/api/projects/not-a-uuid/estimate', expected: active(401, 404) },
  ],
  'HEAD /api/projects/:id/estimate': [
    { method: 'HEAD', url: projectUrl('/estimate'), expected: ownerOnly(200) },
  ],
  'GET /api/admin/users/:id/projects': [
    { method: 'GET', url: workspaceUrl((c) => c.userId), expected: adminOnly(200) },
    { method: 'GET', url: workspaceUrl(() => unknownUser), expected: adminOnly(404) },
  ],
  'HEAD /api/admin/users/:id/projects': [
    { method: 'HEAD', url: workspaceUrl((c) => c.userId), expected: adminOnly(200) },
  ],
  'GET /api/runs/:runId/events': [
    { method: 'GET', url: runUrl('/events', (c) => c.endedRunId), expected: ownerOnly(200) },
    { method: 'GET', url: () => '/api/runs/not-a-uuid/events', expected: active(401, 404) },
  ],
  'POST /api/runs/:runId/stop': [
    { method: 'POST', url: runUrl('/stop', (c) => c.runningRunId), expected: ownerOnly(202) },
    { method: 'POST', url: () => '/api/runs/not-a-uuid/stop', expected: active(401, 404) },
  ],
  'POST /api/account/password': [
    {
      method: 'POST',
      url: '/api/account/password',
      payload: (user) => ({ currentPassword: user?.password ?? newPassword, newPassword }),
      expected: signedIn(401, 200),
    },
  ],
  'GET /api/account/keys': [{ method: 'GET', url: keysUrl, expected: active(401, 200) }],
  'HEAD /api/account/keys': [{ method: 'HEAD', url: keysUrl, expected: active(401, 200) }],
  'PUT /api/account/keys/:provider': [
    {
      method: 'PUT',
      url: `${keysUrl}/openai`,
      payload: () => ({ key: fixtureKey('Matrix01') }),
      expected: active(401, 200),
    },
    {
      method: 'PUT',
      url: `${keysUrl}/ollama`,
      payload: () => ({ key: fixtureKey('Matrix02') }),
      expected: active(401, 404),
    },
  ],
  'DELETE /api/account/keys/:provider': [
    { method: 'DELETE', url: '/api/account/keys/anthropic', expected: active(401, 204) },
  ],
  'POST /api/account/providers/test': [
    { method: 'POST', url: '/api/account/providers/test', expected: active(401, 200) },
  ],
  ...budgetRoutes,
  ...outputRoutes,
  'GET /api/admin/users': [{ method: 'GET', url: '/api/admin/users', expected: adminOnly(200) }],
  'HEAD /api/admin/users': [{ method: 'HEAD', url: '/api/admin/users', expected: adminOnly(200) }],
  'POST /api/admin/users': [
    {
      method: 'POST',
      url: '/api/admin/users',
      payload: () => ({
        userName: 'newcomer',
        displayName: 'Newcomer',
        role: 'user',
        password: fixturePassword('Fresh'),
      }),
      expected: adminOnly(201),
    },
  ],
  'POST /api/admin/users/:id/disable': [
    { method: 'POST', url: adminUserUrl('/disable', (c) => c.userId), expected: adminOnly(200) },
    { method: 'POST', url: adminUserUrl('/disable', () => unknownUser), expected: adminOnly(404) },
  ],
  'POST /api/admin/users/:id/enable': [
    {
      method: 'POST',
      url: adminUserUrl('/enable', (c) => c.disabledUserId),
      expected: adminOnly(200),
    },
  ],
  'POST /api/admin/users/:id/password': [
    {
      method: 'POST',
      url: adminUserUrl('/password', (c) => c.userId),
      payload: () => ({ password: fixturePassword('Reset') }),
      expected: adminOnly(200),
    },
  ],
  'GET /api/admin/audit': [{ method: 'GET', url: '/api/admin/audit', expected: adminOnly(200) }],
  'HEAD /api/admin/audit': [{ method: 'HEAD', url: '/api/admin/audit', expected: adminOnly(200) }],
  'GET /*': [
    { method: 'GET', url: '/index.html', expected: active(302, 200) },
    { method: 'GET', url: '/sign-in', expected: everyone(200) },
    { method: 'GET', url: '/account/password', expected: signedIn(302, 200) },
    { method: 'GET', url: '/missing-page', expected: active(302, 200) },
    { method: 'GET', url: '/projects/a1b2/runs', expected: active(302, 200) },
    { method: 'GET', url: '/assets/missing.js', expected: everyone(404) },
    { method: 'GET', url: '/ASSETS/x.js', expected: active(302, 200) },
    { method: 'GET', url: '/assets%2fnope.js', expected: active(302, 200) },
    { method: 'GET', url: '/api%2fx', expected: active(302, 200) },
    { method: 'GET', url: '/api/missing', expected: active(401, 404) },
  ],
  'HEAD /*': [
    { method: 'HEAD', url: '/index.html', expected: active(302, 200) },
    { method: 'HEAD', url: '/sign-in', expected: everyone(200) },
    { method: 'HEAD', url: '/account/password', expected: signedIn(302, 200) },
    { method: 'HEAD', url: '/missing-page', expected: active(302, 200) },
  ],
};

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function browserFor(
  test: TestServer,
  column: Column,
): Promise<{
  readonly browser: TestBrowser;
  readonly user: TestUser | undefined;
  readonly context: Context;
}> {
  const amy = await addUser(test, { userName: 'amy' });
  const bob = await addUser(test, { userName: 'bob' });
  const root = await addUser(test, { userName: 'root', role: 'admin' });
  const mia = await addUser(test, { userName: 'mia', role: 'admin', state: 'MustChangePassword' });
  const dan = await addUser(test, { userName: 'dan', state: 'Disabled' });
  const users: Record<Column, TestUser | undefined> = {
    anonymous: undefined,
    user: amy,
    otherUser: bob,
    admin: root,
    mustChange: mia,
  };
  const user = users[column];
  // RF-1104: each signed-in column has its own key to delete.
  if (user !== undefined) await test.keys.upsert(sampleKeyRecord(user.account.id, 'anthropic'));
  const browser =
    user === undefined ? new TestBrowser(test.server) : await signedInBrowser(test.server, user);
  const project = sampleProject({ userId: amy.account.id });
  await test.projects.insertOrFind(project);
  // RF-425: the estimate reads the code map of the project's latest completed scan.
  await test.runs.runs.insert(completedScan(project.id, amy.account.id));
  const owner = actorOf(amy.account);
  const ended = await test.runs.start(owner);
  test.runs.executor.settle(ended.id, { endState: 'Completed' });
  await test.runs.ended(ended);
  test.archives.seed(test.runs.scopeOf(ended), {
    'manifest.json': '{}',
    'handoff/README.md': '# Hand-off',
  });
  test.runFiles.seed(test.runs.scopeOf(ended), { 'manifest.json': '{}' });
  const running = await test.runs.start(owner);
  const context = {
    projectId: project.id,
    userId: amy.account.id,
    disabledUserId: dan.account.id,
    endedRunId: ended.id,
    runningRunId: running.id,
  };
  return { browser, user, context };
}

const cases = Object.entries(matrix).flatMap(([route, probes]) =>
  probes.flatMap((probe, index) =>
    columns.map((column) => [route, String(index + 1), column, probe] as const),
  ),
);

describe('access matrix', () => {
  it('RF-1105 the matrix has a row for every route the server has, and no other', async () => {
    current = createTestServer({ staticRoot });
    await current.server.ready();

    const routes = current.routes();

    expect(routes).toEqual(Object.keys(matrix).sort());
  });

  it.each(cases)('RF-1105 %s probe %s as %s', async (_route, _url, column, probe) => {
    current = createTestServer({ staticRoot });
    const { browser, user, context } = await browserFor(current, column);

    const response = await browser.request({
      method: probe.method,
      url: typeof probe.url === 'string' ? probe.url : probe.url(context),
      ...(probe.payload === undefined ? {} : { payload: probe.payload(user) }),
    });

    expect(response.statusCode).toBe(probe.expected[column]);
  });
});

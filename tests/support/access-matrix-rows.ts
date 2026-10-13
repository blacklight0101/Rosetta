import type { InjectOptions } from 'fastify';
import { fixturePassword } from './account-fixtures.js';
import { active, adminOnly, everyone, ownerOnly, signedIn } from './access-columns.js';
import { budgetRoutes, outputRoutes, type Context, type Probe } from './access-probes.js';
import { settingsWith } from './project-fixtures.js';
import { fixtureKey } from './provider-key-fixtures.js';
import type { TestUser } from './test-browser.js';

// RF-1105, RF-1009, conventions section 7: the rows of the access matrix, one per route (method and
// path as Fastify prints them), grouped by area. Each area runs in its own test file
// (tests/integration/access-matrix*.test.ts) so Vitest runs them in parallel; access-matrix.test.ts
// checks that the areas together hold exactly the routes the server has. A new route gets its row in
// the area it belongs to here.

type Rows = Readonly<Record<string, readonly Probe[]>>;

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

/** The public routes and the session. */
const publicRows: Rows = {
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
};

/** Projects, their runs and estimate, and the administrator's view of a user's workspace. */
const projectRows: Rows = {
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
  'GET /api/runs/:runId': [
    { method: 'GET', url: runUrl('', (c) => c.endedRunId), expected: ownerOnly(200) },
    { method: 'GET', url: () => '/api/runs/not-a-uuid', expected: active(401, 404) },
  ],
  'GET /api/runs/:runId/events': [
    { method: 'GET', url: runUrl('/events', (c) => c.endedRunId), expected: ownerOnly(200) },
    { method: 'GET', url: () => '/api/runs/not-a-uuid/events', expected: active(401, 404) },
  ],
  'POST /api/runs/:runId/stop': [
    { method: 'POST', url: runUrl('/stop', (c) => c.runningRunId), expected: ownerOnly(202) },
    { method: 'POST', url: () => '/api/runs/not-a-uuid/stop', expected: active(401, 404) },
  ],
};

/** The user's own account: password, keys and the provider test. */
const accountRows: Rows = {
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
};

/** The administrator's users and audit routes. */
const adminRows: Rows = {
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
};

/** The pages of the web UI behind the catch-all routes. */
const pageRows: Rows = {
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

/** Every area of the matrix; each route is in exactly one. */
export const matrixAreas = {
  public: publicRows,
  projects: projectRows,
  account: accountRows,
  admin: adminRows,
  pages: pageRows,
  budget: budgetRoutes,
  output: outputRoutes,
} as const;

/** The whole matrix: every row of every area. */
export const matrix: Rows = Object.fromEntries(
  Object.values(matrixAreas).flatMap((rows) => Object.entries(rows)),
);

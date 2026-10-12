import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { InjectOptions } from 'fastify';
import { actorOf } from '../../src/domain/accounts/actor.js';
import { fixturePassword } from '../support/account-fixtures.js';
import { sampleProject, settingsWith } from '../support/project-fixtures.js';
import { addUser, signedInBrowser, TestBrowser, type TestUser } from '../support/test-browser.js';
import { createTestServer, type TestServer } from '../support/web-server.js';

// RF-1105, RF-1009, conventions section 7: every route has a row in the access matrix with the
// answer for anonymous, a user, another user and an administrator. The routes are read from the
// server itself (with the static front end mounted), so a new route without a row fails this test.

type Column = 'anonymous' | 'user' | 'otherUser' | 'admin';
type Method = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'DELETE';

/** What the rows need to name: the project and runs of the user column and a user id to open. */
interface Context {
  readonly projectId: string;
  readonly userId: string;
  /** A run of that user that has ended, so its event stream closes by itself. */
  readonly endedRunId: string;
  /** A run of that user that is running. */
  readonly runningRunId: string;
}

interface Probe {
  readonly method: Method;
  readonly url: string | ((context: Context) => string);
  /** The body, given the column's own credentials (undefined for anonymous). */
  readonly payload?: (user: TestUser | undefined) => InjectOptions['payload'];
  readonly expected: Readonly<Record<Column, number>>;
}

const staticRoot = fileURLToPath(new URL('../fixtures/static-site/', import.meta.url));
const everyone = (status: number): Record<Column, number> => ({
  anonymous: status,
  user: status,
  otherUser: status,
  admin: status,
});
const signedIn = (anonymous: number, status: number): Record<Column, number> => ({
  anonymous,
  user: status,
  otherUser: status,
  admin: status,
});
const ownCredentials = (user: TestUser | undefined): InjectOptions['payload'] => ({
  userName: user?.account.userName ?? 'nobody',
  password: user?.password ?? fixturePassword('Anonymous'),
});

/** A project of the "user" column: it answers its owner, and 404 to every other signed-in user. */
const ownerOnly = (status: number): Record<Column, number> => ({
  anonymous: 401,
  user: status,
  otherUser: 404,
  admin: 404,
});
const unknownUser = '00000000-0000-4000-9000-00000000ffff';
const projectUrl = (suffix: string) => (context: Context) =>
  `/api/projects/${context.projectId}${suffix}`;
const workspaceUrl = (userId: (context: Context) => string) => (context: Context) =>
  `/api/admin/users/${userId(context)}/projects`;
const runUrl = (suffix: string, pick: (context: Context) => string) => (context: Context) =>
  `/api/runs/${pick(context)}${suffix}`;
const adminOnly = (admin: number): Record<Column, number> => ({
  anonymous: 401,
  user: 403,
  otherUser: 403,
  admin,
});

/** One row per route (method and path as Fastify prints them), with one or more probes. */
const matrix: Readonly<Record<string, readonly Probe[]>> = {
  'GET /healthz': [{ method: 'GET', url: '/healthz', expected: everyone(200) }],
  'HEAD /healthz': [{ method: 'HEAD', url: '/healthz', expected: everyone(200) }],
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
      expected: signedIn(401, 201),
    },
  ],
  'GET /api/projects': [{ method: 'GET', url: '/api/projects', expected: signedIn(401, 200) }],
  'HEAD /api/projects': [{ method: 'HEAD', url: '/api/projects', expected: signedIn(401, 200) }],
  'GET /api/projects/:id': [
    { method: 'GET', url: projectUrl(''), expected: ownerOnly(200) },
    { method: 'GET', url: () => '/api/projects/not-a-uuid', expected: signedIn(401, 404) },
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
  'GET /api/admin/users/:id/projects': [
    { method: 'GET', url: workspaceUrl((c) => c.userId), expected: adminOnly(200) },
    { method: 'GET', url: workspaceUrl(() => unknownUser), expected: adminOnly(404) },
  ],
  'HEAD /api/admin/users/:id/projects': [
    { method: 'HEAD', url: workspaceUrl((c) => c.userId), expected: adminOnly(200) },
  ],
  'GET /api/runs/:runId/events': [
    { method: 'GET', url: runUrl('/events', (c) => c.endedRunId), expected: ownerOnly(200) },
    { method: 'GET', url: () => '/api/runs/not-a-uuid/events', expected: signedIn(401, 404) },
  ],
  'POST /api/runs/:runId/stop': [
    { method: 'POST', url: runUrl('/stop', (c) => c.runningRunId), expected: ownerOnly(202) },
    { method: 'POST', url: () => '/api/runs/not-a-uuid/stop', expected: signedIn(401, 404) },
  ],
  'GET *': [
    { method: 'GET', url: '/', expected: everyone(200) },
    { method: 'GET', url: '/index.html', expected: signedIn(302, 200) },
    { method: 'GET', url: '/missing-page', expected: signedIn(302, 404) },
    { method: 'GET', url: '/api/missing', expected: signedIn(401, 404) },
  ],
  'HEAD *': [
    { method: 'HEAD', url: '/', expected: everyone(200) },
    { method: 'HEAD', url: '/index.html', expected: signedIn(302, 200) },
  ],
};

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

/**
 * "METHOD path" for every route of the server, from Fastify's route listing. The listing is a tree
 * (four characters of indentation per level): a node's path is its own text after those of its
 * parents, and only nodes that end in a method list are routes.
 */
function routesOf(listing: string): readonly string[] {
  const parents: string[] = [];
  const routes: string[] = [];
  for (const line of listing.split('\n')) {
    const match = /^((?:│ {3}| {4})*)[├└]── (\S+)(?: \(([A-Z, ]+)\))?$/u.exec(line);
    if (match === null) continue;
    const depth = (match[1] ?? '').length / 4;
    parents.length = depth;
    parents.push(match[2] ?? '');
    for (const method of (match[3] ?? '').split(', ').filter((name) => name !== '')) {
      routes.push(`${method} ${parents.join('')}`);
    }
  }
  return routes.sort();
}

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
  const users: Record<Column, TestUser | undefined> = {
    anonymous: undefined,
    user: amy,
    otherUser: bob,
    admin: root,
  };
  const user = users[column];
  const browser =
    user === undefined ? new TestBrowser(test.server) : await signedInBrowser(test.server, user);
  const project = sampleProject({ userId: amy.account.id });
  await test.projects.insertOrFind(project);
  const owner = actorOf(amy.account);
  const ended = await test.runs.start(owner);
  test.runs.executor.settle(ended.id, { endState: 'Completed' });
  await test.runs.ended(ended);
  const running = await test.runs.start(owner);
  const context = {
    projectId: project.id,
    userId: amy.account.id,
    endedRunId: ended.id,
    runningRunId: running.id,
  };
  return { browser, user, context };
}

const cases = Object.entries(matrix).flatMap(([route, probes]) =>
  probes.flatMap((probe, index) =>
    (['anonymous', 'user', 'otherUser', 'admin'] as const).map(
      (column) => [route, String(index + 1), column, probe] as const,
    ),
  ),
);

describe('access matrix', () => {
  it('RF-1105 the matrix has a row for every route the server has, and no other', async () => {
    current = createTestServer({ staticRoot });
    await current.server.ready();

    const routes = routesOf(current.server.printRoutes({ commonPrefix: false }));

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

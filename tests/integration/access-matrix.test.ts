import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { InjectOptions } from 'fastify';
import { fixturePassword } from '../support/account-fixtures.js';
import { addUser, signedInBrowser, TestBrowser, type TestUser } from '../support/test-browser.js';
import { createTestServer, type TestServer } from '../support/web-server.js';

// RF-1105, RF-1009, conventions section 7: every route has a row in the access matrix with the
// answer for anonymous, a user, another user and an administrator. The routes are read from the
// server itself (with the static front end mounted), so a new route without a row fails this test.

type Column = 'anonymous' | 'user' | 'otherUser' | 'admin';
type Method = 'GET' | 'HEAD' | 'POST' | 'DELETE';

interface Probe {
  readonly method: Method;
  readonly url: string;
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

/** "METHOD path" for every route of the server, from Fastify's route listing. */
function routesOf(listing: string): readonly string[] {
  return listing
    .split('\n')
    .map((line) => /([^\s─│├└]+) \(([A-Z, ]+)\)$/.exec(line))
    .flatMap((match) =>
      match === null
        ? []
        : (match[2] ?? '').split(', ').map((method) => `${method} ${match[1] ?? ''}`),
    )
    .sort();
}

async function browserFor(
  test: TestServer,
  column: Column,
): Promise<{
  readonly browser: TestBrowser;
  readonly user: TestUser | undefined;
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
  return { browser, user };
}

const cases = Object.entries(matrix).flatMap(([route, probes]) =>
  probes.flatMap((probe) =>
    (['anonymous', 'user', 'otherUser', 'admin'] as const).map(
      (column) => [route, probe.url, column, probe] as const,
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

  it.each(cases)('RF-1105 %s (%s) as %s', async (_route, _url, column, probe) => {
    current = createTestServer({ staticRoot });
    const { browser, user } = await browserFor(current, column);

    const response = await browser.request({
      method: probe.method,
      url: probe.url,
      ...(probe.payload === undefined ? {} : { payload: probe.payload(user) }),
    });

    expect(response.statusCode).toBe(probe.expected[column]);
  });
});

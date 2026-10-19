import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../src/domain/accounts/actor.js';
import { columns, type Column } from './access-columns.js';
import type { Context, Probe } from './access-probes.js';
import { seedEndedRun } from './call-fixtures.js';
import { completedScan } from './estimate-harness.js';
import { sampleProject } from './project-fixtures.js';
import { sampleKeyRecord } from './provider-key-fixtures.js';
import { addUser, signedInBrowser, TestBrowser, type TestUser } from './test-browser.js';
import { createTestServer, type TestServer } from './web-server.js';

// RF-1105, RF-1009: runs the rows of one area of the access matrix (access-matrix-rows.ts) for every
// column: anonymous, a user, another user, an administrator and an administrator whose password must
// be changed (RF-1102). Each test file calls describeAccessMatrix with its area.

export const staticRoot = fileURLToPath(new URL('../fixtures/static-site/', import.meta.url));

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
  await seedEndedRun(test, ended);
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

/** One case per probe and column of the given rows. */
function casesOf(matrix: Readonly<Record<string, readonly Probe[]>>) {
  return Object.entries(matrix).flatMap(([route, probes]) =>
    probes.flatMap((probe, index) =>
      columns.map((column) => [route, String(index + 1), column, probe] as const),
    ),
  );
}

/**
 * Registers the "access matrix" suite for the given rows; `extra` adds tests to the same suite and
 * gets the server of the running test to close afterwards.
 */
export function describeAccessMatrix(
  rows: Readonly<Record<string, readonly Probe[]>>,
  extra?: (use: (server: TestServer) => TestServer) => void,
): void {
  let current: TestServer | undefined;
  const use = (server: TestServer): TestServer => {
    current = server;
    return server;
  };

  afterEach(async () => {
    await current?.server.close();
    current = undefined;
  });

  describe('access matrix', () => {
    extra?.(use);

    it.each(casesOf(rows))('RF-1105 %s probe %s as %s', async (_route, _url, column, probe) => {
      const test = use(createTestServer({ staticRoot }));
      const { browser, user, context } = await browserFor(test, column);

      const response = await browser.request({
        method: probe.method,
        url: typeof probe.url === 'string' ? probe.url : probe.url(context),
        ...(probe.payload === undefined ? {} : { payload: probe.payload(user) }),
        ...(probe.headers === undefined ? {} : { headers: probe.headers }),
      });

      expect(response.statusCode).toBe(probe.expected[column]);
    });
  });
}

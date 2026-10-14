import { afterEach, describe, expect, it } from 'vitest';
import { actorOf } from '../../../../src/domain/accounts/actor.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import { connectSse, type SseConnection } from '../../../support/sse-client.js';
import {
  addUser,
  signedInBrowser,
  type TestBrowser,
  type TestUser,
} from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1101, P1-160 (F-09): an open event stream ends with the session it was opened in. Signing
// out, a session that expires, a disabled account and a password change or reset end every open
// stream of that session or user (two tabs share the session), and never another user's.

const HOUR = 3_600_000;

let current: TestServer | undefined;
const connections: SseConnection[] = [];

afterEach(async () => {
  for (const connection of connections.splice(0)) connection.abort();
  await current?.server.close();
  current = undefined;
});

interface Reader {
  readonly user: TestUser;
  readonly browser: TestBrowser;
  /** Opens one more stream (a tab) on the user's run with the user's cookies. */
  readonly open: () => Promise<SseConnection>;
}

interface Setup {
  readonly test: TestServer;
  readonly base: string;
  readonly reader: (userName: string, role?: 'admin') => Promise<Reader>;
}

async function setup(): Promise<Setup> {
  const test = createTestServer();
  current = test;
  const base = await test.server.listen({ host: '127.0.0.1', port: 0 });
  const reader = async (userName: string, role?: 'admin'): Promise<Reader> => {
    const user = await addUser(test, { userName, ...(role === undefined ? {} : { role }) });
    const browser = await signedInBrowser(test.server, user);
    let runId: string | undefined;
    const open = async (): Promise<SseConnection> => {
      runId ??= (await test.runs.start(actorOf(user.account))).id;
      const cookie = [...browser.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
      const connection = await connectSse(`${base}/api/runs/${runId}/events`, { cookie });
      connections.push(connection);
      await connection.waitFor('event: run.started');
      return connection;
    };
    return { user, browser, open };
  };
  return { test, base, reader };
}

/** True once the stream has ended; checked after the server has had its chance to end it. */
function tracked(connection: SseConnection): () => boolean {
  let ended = false;
  void connection.ended.then(() => {
    ended = true;
  });
  return () => ended;
}

/** The stream has ended (asserted, so a stream that stays open fails rather than hangs). */
async function expectEnded(...connections: SseConnection[]): Promise<void> {
  const ended = connections.map(tracked);
  await expect.poll(() => ended.every((check) => check()), { timeout: 2000 }).toBe(true);
}

/** The stream is still open: it receives the next keep-alive. */
async function expectOpen(test: TestServer, connection: SseConnection): Promise<void> {
  const before = connection.text().split(': keepalive').length;
  await test.heartbeat.tick();
  await expect.poll(() => connection.text().split(': keepalive').length).toBeGreaterThan(before);
}

describe('event streams and signing out', () => {
  it('RF-1101 signing out ends the streams of both tabs of the session, not another user', async () => {
    const { test, reader } = await setup();
    const [amy, bob] = [await reader('amy'), await reader('bob')];
    const [tab1, tab2, other] = [await amy.open(), await amy.open(), await bob.open()];
    const otherEnded = tracked(other);

    const response = await amy.browser.request({ method: 'DELETE', url: '/api/session' });

    expect(response.statusCode).toBe(204);
    await expectEnded(tab1, tab2);
    await expectOpen(test, other);
    expect(otherEnded()).toBe(false);
    expect(test.streams.size).toBe(1);
  });
});

describe('event streams and administrator changes', () => {
  it('RF-1101 disabling an account ends every open stream of that user, not another user', async () => {
    const { test, reader } = await setup();
    const admin = await reader('root', 'admin');
    const [amy, bob] = [await reader('amy'), await reader('bob')];
    const [tab1, tab2, other] = [await amy.open(), await amy.open(), await bob.open()];

    const url = `/api/admin/users/${amy.user.account.id}/disable`;
    const response = await admin.browser.request({ method: 'POST', url, payload: {} });

    expect(response.statusCode).toBe(200);
    await expectEnded(tab1, tab2);
    await expectOpen(test, other);
  });

  it('RF-1101 an administrator resetting the password ends the open streams of that user', async () => {
    const { test, reader } = await setup();
    const admin = await reader('root', 'admin');
    const [amy, bob] = [await reader('amy'), await reader('bob')];
    const [tab, other] = [await amy.open(), await bob.open()];

    const url = `/api/admin/users/${amy.user.account.id}/password`;
    const payload = { password: fixturePassword('Reset') };
    const response = await admin.browser.request({ method: 'POST', url, payload });

    expect(response.statusCode).toBe(200);
    await expectEnded(tab);
    await expectOpen(test, other);
  });
});

describe('event streams and an account disabled elsewhere', () => {
  it('RF-1101 the next request of a disabled account ends that user streams, not another user', async () => {
    const { test, reader } = await setup();
    const [amy, bob] = [await reader('amy'), await reader('bob')];
    const [tab, other] = [await amy.open(), await bob.open()];
    await test.users.update({ ...amy.user.account, state: 'Disabled' });

    const response = await amy.browser.request({ method: 'GET', url: '/api/session' });

    expect(response.statusCode).toBe(401);
    await expectEnded(tab);
    await expectOpen(test, other);
  });
});

describe('event streams and the user own changes', () => {
  it('RF-1101 changing the own password ends the streams of the old session', async () => {
    const { test, reader } = await setup();
    const [amy, bob] = [await reader('amy'), await reader('bob')];
    const [tab, other] = [await amy.open(), await bob.open()];

    const payload = { currentPassword: amy.user.password, newPassword: fixturePassword('Newer') };
    const response = await amy.browser.request({
      method: 'POST',
      url: '/api/account/password',
      payload,
    });

    expect(response.statusCode).toBe(200);
    await expectEnded(tab);
    await expectOpen(test, other);
  });
});

describe('event streams and session expiry', () => {
  it('RF-1101 a stream ends at the first keep-alive once its session has expired, and not before', async () => {
    const { test, reader } = await setup();
    const amy = await reader('amy');
    const tab = await amy.open();
    const tabEnded = tracked(tab);
    test.clock.advance(HOUR);
    const bob = await reader('bob');
    const other = await bob.open();

    test.clock.advance(7 * HOUR - 1);
    await expectOpen(test, tab);
    expect(tabEnded()).toBe(false);

    test.clock.advance(1);
    await test.heartbeat.tick();
    await expectEnded(tab);
    await expectOpen(test, other);
    expect(test.streams.size).toBe(1);
  });
});

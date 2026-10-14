import { afterEach, describe, expect, it, vi } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1109, RF-1009, P1-160 (F-10): a request refused for its `Origin` is audited with its actor when
// it carries a valid session cookie, and without one when the cookie is unknown, expired or belongs
// to a disabled account. A session lookup that fails still answers 403, without an actor.

const HOUR = 3_600_000;
const evil = 'https://evil.example';

let current: TestServer | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  await current?.server.close();
  current = undefined;
});

interface Setup {
  readonly test: TestServer;
  readonly amyId: string;
  readonly browser: TestBrowser;
}

async function setup(): Promise<Setup> {
  const test = createTestServer();
  current = test;
  test.server.post('/api/probe', { config: { access: 'user' } }, () => ({ ok: true }));
  const amy = await addUser(test, { userName: 'amy' });
  return { test, amyId: amy.account.id, browser: await signedInBrowser(test.server, amy) };
}

async function refusedActors(test: TestServer): Promise<readonly (string | null)[]> {
  const rows = await test.audit.list({ since: 0, action: 'request.refused' });
  return rows.map((row) => row.actorUserId);
}

function originEvents(test: TestServer) {
  return test.logger.entries.filter((entry) => entry.code === ERROR_CODES.originRefused);
}

describe('a cross-origin refusal with a valid session', () => {
  it('RF-1109 records the actor of the session in the audit row and the security event', async () => {
    const { test, amyId, browser } = await setup();

    const response = await browser.request({ method: 'POST', url: '/api/probe', origin: evil });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.originRefused });
    expect(await refusedActors(test)).toEqual([amyId]);
    expect(originEvents(test).map((entry) => entry.userId)).toEqual([amyId]);
  });

  it('RF-1109 records the actor when the Origin header is missing', async () => {
    const { test, amyId, browser } = await setup();

    const response = await browser.request({ method: 'DELETE', url: '/api/session', origin: null });

    expect(response.statusCode).toBe(403);
    expect(await refusedActors(test)).toEqual([amyId]);
  });

  it('RF-1109 records the actor on a public route that refuses the Origin (sign-in)', async () => {
    const { test, amyId, browser } = await setup();

    const payload = { userName: 'amy', password: 'irrelevant-here' };
    const response = await browser.request({
      method: 'POST',
      url: '/api/session',
      origin: evil,
      payload,
    });

    expect(response.statusCode).toBe(403);
    expect(await refusedActors(test)).toEqual([amyId]);
  });
});

describe('a cross-origin refusal without a valid session', () => {
  it('RF-1109 records no actor for an unknown session cookie', async () => {
    const { test, browser } = await setup();
    browser.cookies.set('__Host-rosetta_session', 'x'.repeat(43));

    await browser.request({ method: 'POST', url: '/api/probe', origin: evil });

    expect(await refusedActors(test)).toEqual([null]);
    expect(originEvents(test).map((entry) => entry.userId)).toEqual([undefined]);
  });

  it('RF-1109 records no actor for an expired session', async () => {
    const { test, browser } = await setup();
    test.clock.advance(8 * HOUR);

    await browser.request({ method: 'POST', url: '/api/probe', origin: evil });

    expect(await refusedActors(test)).toEqual([null]);
  });

  it('RF-1109 records no actor for the session of a disabled account', async () => {
    const { test, amyId, browser } = await setup();
    const account = await test.users.findById(amyId);
    if (account !== undefined) await test.users.update({ ...account, state: 'Disabled' });

    await browser.request({ method: 'POST', url: '/api/probe', origin: evil });

    expect(await refusedActors(test)).toEqual([null]);
  });

  it('RF-1009 a failing session lookup still answers 403 RST-2007, audited without an actor', async () => {
    const { test, browser } = await setup();
    vi.spyOn(test.sessions, 'touch').mockRejectedValue(new Error('database down'));

    const response = await browser.request({ method: 'POST', url: '/api/probe', origin: evil });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.originRefused });
    expect(await refusedActors(test)).toEqual([null]);
  });
});

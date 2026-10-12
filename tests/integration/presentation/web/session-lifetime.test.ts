import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { addUser, signedInBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1101 with a fixed clock: given 8 hours without activity or 7 days since sign-in, when the
// next request arrives, then the session is ended and I must sign in again; given Sign out, the
// session is deleted on the server and the cookie is cleared; given an administrator disables my
// account, when my next request arrives, then all my sessions are ended.

const hourMs = 3_600_000;
let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

async function signedIn() {
  current = createTestServer();
  const amy = await addUser(current, { userName: 'amy' });
  const browser = await signedInBrowser(current.server, amy);
  return { test: current, amy, browser };
}

describe('session lifetime', () => {
  it('RF-1101 a session idle for 8 hours is ended', async () => {
    const { test, browser } = await signedIn();

    test.clock.advance(8 * hourMs - 1);
    const justInTime = await browser.request({ method: 'GET', url: '/api/session' });
    test.clock.advance(8 * hourMs);
    const tooLate = await browser.request({ method: 'GET', url: '/api/session' });

    expect(justInTime.statusCode).toBe(200);
    expect(tooLate.statusCode).toBe(401);
    expect(tooLate.json()).toMatchObject({ code: ERROR_CODES.notSignedIn });
    expect(test.sessions.storedKeys()).toEqual([]);
  });

  it('RF-1101 a session in use is ended 7 days after sign-in', async () => {
    const { test, browser } = await signedIn();
    for (let hours = 7; hours < 7 * 24; hours += 7) {
      test.clock.advance(7 * hourMs);
      const response = await browser.request({ method: 'GET', url: '/api/session' });
      expect(response.statusCode).toBe(200);
    }

    test.clock.advance(7 * hourMs);
    const afterSevenDays = await browser.request({ method: 'GET', url: '/api/session' });

    expect(afterSevenDays.statusCode).toBe(401);
  });
});

describe('sign-out and disabled accounts', () => {
  it('RF-1101 signing out deletes the session on the server and clears the cookie', async () => {
    const { test, browser } = await signedIn();
    const sessionId = browser.cookies.get('__Host-rosetta_session') ?? '';

    const signOut = await browser.request({ method: 'DELETE', url: '/api/session' });
    browser.cookies.set('__Host-rosetta_session', sessionId);
    const replayed = await browser.request({ method: 'GET', url: '/api/session' });

    expect(signOut.statusCode).toBe(204);
    expect(signOut.cookies).toEqual([
      expect.objectContaining({
        name: '__Host-rosetta_session',
        value: '',
        maxAge: 0,
        httpOnly: true,
        secure: true,
        sameSite: 'Strict',
        path: '/',
      }),
    ]);
    expect(test.sessions.storedKeys()).toEqual([]);
    expect(replayed.statusCode).toBe(401);
    const actions = (await test.audit.list({ since: new Date(0) })).map((event) => event.action);
    expect(actions).toContain('auth.sign_out');
  });

  it('RF-1101 when the account is disabled, every session of it ends at the next request', async () => {
    const { test, amy, browser } = await signedIn();
    const second = await signedInBrowser(test.server, amy);
    await test.users.update({ ...amy.account, state: 'Disabled' });

    const next = await browser.request({ method: 'GET', url: '/api/session' });
    const other = await second.request({ method: 'GET', url: '/api/session' });

    expect(next.statusCode).toBe(401);
    expect(other.statusCode).toBe(401);
    expect(test.sessions.storedKeys()).toEqual([]);
  });
});

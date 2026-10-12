import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { CSRF_COOKIE } from '../../../../src/presentation/web/session-cookies.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1009, RF-1101: the CSRF secret lives in the `__Host-rosetta_csrf` cookie. Sign-out clears it
// and sign-in replaces it, so a token issued to an earlier session is refused once the browser has
// signed in again.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

function serve(): TestServer {
  current = createTestServer();
  current.server.post('/api/probe', { config: { access: 'user' } }, () => ({ ok: true }));
  return current;
}

async function signInAgain(browser: TestBrowser, userName: string, password: string) {
  const response = await browser.signIn(userName, password);
  expect(response.statusCode).toBe(200);
  return response;
}

describe('CSRF secret at sign-in and sign-out', () => {
  it('RF-1009 a token issued before sign-out is refused after another sign-in', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);
    const earlier = browser.csrfToken ?? '';

    const signedOut = await browser.request({ method: 'DELETE', url: '/api/session' });
    await signInAgain(browser, 'amy', amy.password);
    const stale = await browser.request({ method: 'POST', url: '/api/probe', csrf: earlier });
    const fresh = await browser.request({ method: 'POST', url: '/api/probe' });

    expect(signedOut.statusCode).toBe(204);
    expect(stale.statusCode).toBe(403);
    expect(stale.json()).toMatchObject({ code: ERROR_CODES.csrfTokenInvalid });
    expect(fresh.statusCode).toBe(200);
  });

  it('RF-1101 sign-out clears the CSRF secret cookie', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);
    expect(browser.cookies.has(CSRF_COOKIE)).toBe(true);

    const signedOut = await browser.request({ method: 'DELETE', url: '/api/session' });

    const cleared = signedOut.cookies.find((cookie) => cookie.name === CSRF_COOKIE);
    expect(cleared).toBeDefined();
    expect(browser.cookies.has(CSRF_COOKIE)).toBe(false);
  });

  it('RF-1009 sign-in replaces the CSRF secret the browser already had', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);
    const earlierSecret = browser.cookies.get(CSRF_COOKIE);
    const earlier = browser.csrfToken ?? '';

    await signInAgain(browser, 'amy', amy.password);
    const stale = await browser.request({ method: 'POST', url: '/api/probe', csrf: earlier });

    expect(browser.cookies.get(CSRF_COOKIE)).toBeDefined();
    expect(browser.cookies.get(CSRF_COOKIE)).not.toBe(earlierSecret);
    expect(stale.statusCode).toBe(403);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1009: given any route other than the landing page, sign-in, /healthz, static assets and
// robots.txt, when it is requested without a valid session, then pages redirect to sign-in and the
// API answers 401. Given a state-changing request whose Origin differs from the public URL or whose
// CSRF token is missing or wrong, then it is refused with 403 and a security event is logged.
// RF-1102, RF-1109: a `user` on an administrator route gets 403 and the attempt is audited.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

function serve(): TestServer {
  current = createTestServer();
  current.server.get('/api/admin/probe', { config: { access: 'admin' } }, () => ({ ok: true }));
  current.server.post('/api/probe', { config: { access: 'user' } }, () => ({ ok: true }));
  return current;
}

async function refusedRows(test: TestServer): Promise<readonly unknown[]> {
  return (await test.audit.list({ since: new Date(0), action: 'request.refused' })).map(
    (event) => event.detail,
  );
}

describe('requests without a session', () => {
  it.each(['/projects', '/settings', '/index.html', '/assets/%2e%2e/secret', '/assets/.env'])(
    'RF-1009 the page %s redirects to /sign-in',
    async (url) => {
      const test = serve();

      const get = await new TestBrowser(test.server).request({ method: 'GET', url });
      const head = await new TestBrowser(test.server).request({ method: 'HEAD', url });

      expect(get.statusCode).toBe(302);
      expect(get.headers.location).toBe('/sign-in');
      expect(head.statusCode).toBe(302);
    },
  );

  it.each([
    ['GET', '/api/session'],
    ['GET', '/api/projects'],
    ['DELETE', '/api/session'],
    ['POST', '/api/probe'],
    ['POST', '/projects'],
  ] as const)('RF-1009 %s %s answers 401 RST-2001', async (method, url) => {
    const test = serve();

    const response = await new TestBrowser(test.server).request({ method, url });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notSignedIn });
  });
});

describe('public paths', () => {
  it.each([
    '/',
    '/sign-in',
    '/assets/app.js',
    '/assets/fonts/archivo.woff2',
    '/healthz',
    '/robots.txt',
  ])('RF-1009 the public path %s is served without a session', async (url) => {
    const test = serve();

    const response = await new TestBrowser(test.server).request({ method: 'GET', url });

    expect(response.statusCode).not.toBe(302);
    expect(response.statusCode).not.toBe(401);
  });

  it('RF-1009 an unknown or malformed session cookie counts as no session', async () => {
    const test = serve();
    const browser = new TestBrowser(test.server);
    browser.cookies.set('__Host-rosetta_session', 'x'.repeat(43));

    const unknown = await browser.request({ method: 'GET', url: '/api/session' });
    browser.cookies.set('__Host-rosetta_session', 'not-a-session');
    const malformed = await browser.request({ method: 'GET', url: '/api/session' });

    expect(unknown.statusCode).toBe(401);
    expect(malformed.statusCode).toBe(401);
  });
});

describe('Origin and CSRF checks', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'] as const)(
    'RF-1009 a %s from another origin is refused with 403, audited and logged',
    async (method) => {
      const test = serve();
      const amy = await addUser(test, { userName: 'amy' });
      const browser = await signedInBrowser(test.server, amy);

      const response = await browser.request({
        method,
        url: '/api/probe',
        origin: 'https://evil.example',
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.originRefused });
      expect(await refusedRows(test)).toEqual([{ reason: 'origin' }]);
      expect(test.logger.entries).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          logger: 'security',
          code: ERROR_CODES.originRefused,
        }),
      );
    },
  );

  it('RF-1009 a state-changing request without an Origin is refused with 403', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);

    const response = await browser.request({ method: 'POST', url: '/api/probe', origin: null });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.originRefused });
  });
});

describe('CSRF checks', () => {
  it.each([
    ['without a token', false],
    ['with a wrong token', 'wrong-token'],
  ] as const)(
    'RF-1009 a signed-in request %s is refused with 403 RST-2008, audited and logged',
    async (_case, csrf) => {
      const test = serve();
      const amy = await addUser(test, { userName: 'amy' });
      const browser = await signedInBrowser(test.server, amy);

      const response = await browser.request({ method: 'POST', url: '/api/probe', csrf });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.csrfTokenInvalid });
      expect(await refusedRows(test)).toEqual([{ reason: 'csrf' }]);
      expect(test.logger.entries).toContainEqual(
        expect.objectContaining({
          level: 'warn',
          logger: 'security',
          code: ERROR_CODES.csrfTokenInvalid,
        }),
      );
    },
  );
});

describe('CSRF tokens of another browser', () => {
  it('RF-1009 a token issued to another browser is refused', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);
    const other = await signedInBrowser(test.server, amy);

    const response = await browser.request({
      method: 'POST',
      url: '/api/probe',
      csrf: other.csrfToken ?? '',
    });

    expect(response.statusCode).toBe(403);
  });

  it('RF-1009 a token without its secret cookie is refused', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);
    browser.cookies.delete('__Host-rosetta_csrf');

    const response = await browser.request({ method: 'POST', url: '/api/probe' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.csrfTokenInvalid });
  });

  it('RF-1009 the same request with the right Origin and token passes', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);

    const response = await browser.request({ method: 'POST', url: '/api/probe' });

    expect(response.statusCode).toBe(200);
    expect(await refusedRows(test)).toEqual([]);
  });
});

describe('role guard', () => {
  it('RF-1102 a user on an administrator route gets 403 and the attempt is audited', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);

    const response = await browser.request({ method: 'GET', url: '/api/admin/probe' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notAllowed });
    const [refused] = await test.audit.list({ since: new Date(0), action: 'request.refused' });
    expect(refused).toMatchObject({ actorUserId: amy.account.id, detail: { reason: 'role' } });
  });

  it('RF-1102 an administrator passes the role guard', async () => {
    const test = serve();
    const admin = await addUser(test, { userName: 'root', role: 'admin' });
    const browser = await signedInBrowser(test.server, admin);

    const response = await browser.request({ method: 'GET', url: '/api/admin/probe' });

    expect(response.statusCode).toBe(200);
  });
});

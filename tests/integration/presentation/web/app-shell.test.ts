import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1009, RF-1013, RF-1201, P1-13: a client route (a page of the front end) answers the built
// index.html, so a browser can open /sign-in or reload /projects; the access rules are those of
// every other request, and /api/ and /assets/ never fall back.

const staticRoot = fileURLToPath(new URL('../../../fixtures/static-site/', import.meta.url));
const shellMarker = 'Static front-end fixture';

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

function serverWithShell(): TestServer {
  current = createTestServer({ staticRoot });
  return current;
}

describe('app shell fallback', () => {
  it('RF-1009 serves the sign-in page to a visitor without a session', async () => {
    const test = serverWithShell();

    const response = await new TestBrowser(test.server).request({ method: 'GET', url: '/sign-in' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain(shellMarker);
  });

  it('RF-1009 answers HEAD /sign-in with the headers and no body', async () => {
    const test = serverWithShell();

    const response = await new TestBrowser(test.server).request({
      method: 'HEAD',
      url: '/sign-in',
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe('');
  });

  it('RF-1009 serves /sign-in with a query string without a session', async () => {
    const test = serverWithShell();

    const response = await new TestBrowser(test.server).request({
      method: 'GET',
      url: '/sign-in?reason=expired',
    });

    expect(response.statusCode).toBe(200);
  });

  it.each(['/projects', '/projects/0b9d1f0a/runs', '/settings', '/missing-page'])(
    'RF-1009 redirects %s to /sign-in when nobody is signed in',
    async (url) => {
      const test = serverWithShell();

      const response = await new TestBrowser(test.server).request({ method: 'GET', url });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/sign-in');
    },
  );
});

describe('app shell fallback for a signed-in user', () => {
  it.each(['/projects', '/projects/0b9d1f0a/runs', '/missing-page'])(
    'RF-1009 serves %s to a signed-in user so the router can draw it',
    async (url) => {
      const test = serverWithShell();
      const browser = await signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));

      const response = await browser.request({ method: 'GET', url });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain(shellMarker);
    },
  );
});

describe('app shell fallback limits', () => {
  it.each(['/sign-in', '/projects'])(
    'RF-1013 %s carries the content security policy, nosniff and noindex',
    async (url) => {
      const test = serverWithShell();
      const browser = await signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));

      const response = await browser.request({ method: 'GET', url });

      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
      expect(response.headers['content-security-policy']).toContain("frame-ancestors 'none'");
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['referrer-policy']).toBe('no-referrer');
      expect(response.headers['x-robots-tag']).toBe('noindex, nofollow');
    },
  );

  it.each(['/api/missing', '/api', '/assets/missing.js', '/assets'])(
    'RF-1009 does not fall back for %s: a signed-in user gets the JSON not-found answer',
    async (url) => {
      const test = serverWithShell();
      const browser = await signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));

      const response = await browser.request({ method: 'GET', url });

      expect(response.statusCode).toBe(404);
      expect(response.headers['content-type']).toContain('application/json');
    },
  );

  it('RF-1009 does not fall back for a state-changing request to a page path', async () => {
    const test = serverWithShell();
    const browser = await signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));

    const response = await browser.request({ method: 'POST', url: '/projects', payload: {} });

    expect(response.statusCode).toBe(404);
  });

  it('RF-1009 answers /sign-in with the JSON not-found answer when no front end is mounted', async () => {
    current = createTestServer();

    const response = await new TestBrowser(current.server).request({
      method: 'GET',
      url: '/sign-in',
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('app shell fallback and path variants', () => {
  it.each(['/ASSETS/x.js', '/assets%2fnope.js', '/api%2fx'])(
    'RF-1009 %s is not public: a visitor without a session is sent to /sign-in',
    async (url) => {
      const test = serverWithShell();

      const response = await new TestBrowser(test.server).request({ method: 'GET', url });

      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('/sign-in');
    },
  );

  it.each(['/ASSETS/x.js', '/assets%2fnope.js', '/api%2fx'])(
    'RF-1009 %s answers the front end to a signed-in user (the match is case-sensitive and does not decode)',
    async (url) => {
      const test = serverWithShell();
      const browser = await signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));

      const response = await browser.request({ method: 'GET', url });

      expect(response.statusCode).toBe(200);
    },
  );
});

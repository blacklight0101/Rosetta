import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1101, RF-1105, RNF-003: with the session store down, a non-public route never serves its page
// (it answers the unexpected-error answer RST-2006, not a redirect and not the page), the public
// routes still answer, and the landing page's failed lookup leaves one warn line with its code.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const storeDown = (): Promise<never> => Promise.reject(new Error('connect ECONNREFUSED db:5432'));

async function signedInWithStoreDown(): Promise<{ test: TestServer; browser: TestBrowser }> {
  current = createTestServer();
  current.server.get('/api/probe/user', { config: { access: 'user' } }, () => ({ ok: true }));
  current.server.get('/api/probe/admin', { config: { access: 'admin' } }, () => ({ ok: true }));
  const amy = await addUser(current, { userName: 'amy' });
  const browser = await signedInBrowser(current.server, amy);
  current.sessions.touch = storeDown;
  return { test: current, browser };
}

describe('non-public routes with the session store down', () => {
  it.each([
    ['page', '/projects'],
    ['API', '/api/projects'],
    ['session API', '/api/session'],
    ['user probe', '/api/probe/user'],
    ['administrator probe', '/api/probe/admin'],
  ])('RF-1101 the %s %s answers RST-2006 and never serves its page', async (_kind, url) => {
    const { browser } = await signedInWithStoreDown();

    const response = await browser.request({ method: 'GET', url });

    expect(response.statusCode).toBe(500);
    expect(response.headers.location).toBeUndefined();
    expect(response.json()).toMatchObject({ code: ERROR_CODES.unexpected });
  });
});

describe('public routes with the session store down', () => {
  it.each([
    ['/', 'text/html'],
    ['/robots.txt', 'text/plain'],
  ])('RF-1105 %s still answers 200', async (url, type) => {
    const { browser } = await signedInWithStoreDown();

    const response = await browser.request({ method: 'GET', url });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain(type);
  });
});

describe('other public routes with the session store down', () => {
  it.each(['/sign-in', '/assets/missing.js', '/healthz'])(
    'RF-1105 %s answers as it does with the store up',
    async (url) => {
      const { test, browser } = await signedInWithStoreDown();
      const up = await new TestBrowser(test.server).request({ method: 'GET', url });

      const down = await browser.request({ method: 'GET', url });

      expect(down.statusCode).toBe(up.statusCode);
      expect(down.statusCode).not.toBe(500);
    },
  );
});

describe('the landing page lookup failure', () => {
  it('RNF-003 writes one warn line with RST-2404 and the path, and keeps the visitor page', async () => {
    const { test, browser } = await signedInWithStoreDown();

    const response = await browser.request({ method: 'GET', url: '/' });

    const lines = test.logger.entries.filter(
      (entry) => entry.code === ERROR_CODES.databaseQueryFailed,
    );
    expect(response.statusCode).toBe(200);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toEqual({
      schemaVersion: 1,
      at: expect.any(String),
      level: 'warn',
      logger: 'http',
      message: 'The session lookup failed; the page is shown to a visitor.',
      code: ERROR_CODES.databaseQueryFailed,
      data: { path: '/' },
    });
  });

  it('RNF-003 keeps the visitor page when the log write rejects', async () => {
    const { test, browser } = await signedInWithStoreDown();
    test.logger.log = () => Promise.reject(new Error('log file full'));

    const response = await browser.request({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });

  it('RNF-003 keeps the visitor page when the log write throws', async () => {
    const { test, browser } = await signedInWithStoreDown();
    test.logger.log = () => {
      throw new Error('log file full');
    };

    const response = await browser.request({ method: 'GET', url: '/' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/html');
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import { addUser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1100: sign-in is also rate limited to 10 attempts per minute per IP address
// (@fastify/rate-limit); the 11th answers 429 RST-2005 and is logged as a security event.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

describe('sign-in rate limit', () => {
  it('RF-1100 the 11th sign-in attempt within a minute from one address answers 429', async () => {
    current = createTestServer();
    const amy = await addUser(current, { userName: 'amy' });
    const browser = new TestBrowser(current.server);
    const address = { remoteAddress: '203.0.113.20' };
    const attempts = [];
    for (let attempt = 0; attempt < 10; attempt += 1) {
      attempts.push(
        await browser.signIn(`nobody${String(attempt)}`, fixturePassword('X'), address),
      );
    }

    const eleventh = await browser.signIn('amy', amy.password, address);
    const otherAddress = await browser.signIn('amy', amy.password, {
      remoteAddress: '203.0.113.21',
    });

    expect(attempts.map((response) => response.statusCode)).toEqual(Array(10).fill(401));
    expect(eleventh.statusCode).toBe(429);
    expect(eleventh.json()).toMatchObject({ code: ERROR_CODES.rateLimited });
    expect(eleventh.headers['retry-after']).toBeDefined();
    expect(otherAddress.statusCode).toBe(200);
    expect(current.logger.entries).toContainEqual(
      expect.objectContaining({ level: 'warn', logger: 'security', code: ERROR_CODES.rateLimited }),
    );
  });

  it('RF-1100 other routes are not limited by the sign-in limit', async () => {
    current = createTestServer();
    const browser = new TestBrowser(current.server);

    const responses = [];
    for (let request = 0; request < 12; request += 1) {
      responses.push(await browser.request({ method: 'GET', url: '/healthz' }));
    }

    expect(responses.map((response) => response.statusCode)).toEqual(Array(12).fill(200));
  });
});

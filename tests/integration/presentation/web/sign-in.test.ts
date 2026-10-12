import { afterEach, describe, expect, it } from 'vitest';
import type { PasswordHasher } from '../../../../src/application/ports/password-hasher.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { FakePasswordHasher, fixturePassword } from '../../../support/account-fixtures.js';
import { addUser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1100: given the sign-in page, when I enter a correct user name and password for an enabled
// account, then a session starts; given a wrong user name or password, then the answer says only
// "User name or password is incorrect"; five failures within 15 minutes lock the account. RF-1013:
// the session cookie is `__Host-rosetta_session` with HttpOnly, Secure, SameSite=Strict and
// Path=/. RF-1009, DEC-112: sign-in has no session yet and is protected by the Origin check. The
// password field and the body are capped and at most eight sign-ins are verified at a time.

let current: TestServer | undefined;

function serve(options: Parameters<typeof createTestServer>[0] = {}): TestServer {
  current = createTestServer(options);
  return current;
}

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

const incorrect = {
  code: ERROR_CODES.invalidCredentials,
  ...describeError(ERROR_CODES.invalidCredentials),
};

describe('POST /api/session', () => {
  it('RF-1100 a correct user name and password start a session', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = new TestBrowser(test.server);

    const response = await browser.signIn('amy', amy.password);

    expect(response.statusCode).toBe(200);
    const body: unknown = response.json();
    expect(body).toMatchObject({
      user: {
        id: amy.account.id,
        userName: 'amy',
        displayName: 'Sample User',
        role: 'user',
        state: 'Active',
      },
    });
    expect(Object.keys(response.json<Record<string, unknown>>())).toEqual(['user', 'csrfToken']);
    expect(browser.csrfToken).toMatch(/^\S{20,}$/);
    expect(test.sessions.storedKeys()).toHaveLength(1);
    const followUp = await browser.request({ method: 'GET', url: '/api/session' });
    expect(followUp.statusCode).toBe(200);
  });

  it('RF-1013 the session and CSRF cookies are __Host- cookies with HttpOnly, Secure, SameSite=Strict and Path=/', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });

    const response = await new TestBrowser(test.server).signIn('amy', amy.password);
    const header = [response.headers['set-cookie'] ?? []].flat().join('\n');

    for (const name of ['__Host-rosetta_session', '__Host-rosetta_csrf']) {
      const cookie = response.cookies.find((candidate) => candidate.name === name);
      expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Strict', path: '/' });
      expect(cookie).not.toHaveProperty('domain');
    }
    expect(header).not.toMatch(/Max-Age|Expires|Domain/i);
  });
});

describe('POST /api/session failures', () => {
  it('RF-1100 a wrong password and an unknown user name get the same answer', async () => {
    const test = serve();
    await addUser(test, { userName: 'amy' });
    const browser = new TestBrowser(test.server);

    const wrong = await browser.signIn('amy', fixturePassword('Wrong'));
    const unknown = await browser.signIn('nobody', fixturePassword('Wrong'));

    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(incorrect);
    expect(unknown.body).toBe(wrong.body);
    expect(wrong.cookies).toEqual([]);
    expect(incorrect.message).toBe('User name or password is incorrect.');
  });

  it('RF-1100 five failures lock the account: the right password is then refused and a security event logged', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = new TestBrowser(test.server);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await browser.signIn('amy', fixturePassword('Wrong'));
    }

    const locked = await browser.signIn('amy', amy.password);

    expect(locked.statusCode).toBe(401);
    expect(locked.json()).toEqual(incorrect);
    expect(test.logger.entries).toContainEqual(
      expect.objectContaining({
        level: 'warn',
        logger: 'security',
        code: ERROR_CODES.accountLocked,
      }),
    );
    const actions = (await test.audit.list({ since: 0 })).map((event) => event.action);
    expect(actions).toContain('auth.locked');
  });
});

describe('POST /api/session rotation and audit', () => {
  it('RF-1101 signing in again replaces the session id and ends the old one', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = new TestBrowser(test.server);
    await browser.signIn('amy', amy.password);
    const firstId = browser.cookies.get('__Host-rosetta_session') ?? '';

    await browser.signIn('amy', amy.password);
    const secondId = browser.cookies.get('__Host-rosetta_session') ?? '';
    browser.cookies.set('__Host-rosetta_session', firstId);
    const withOldId = await browser.request({ method: 'GET', url: '/api/session' });

    expect(secondId).not.toBe(firstId);
    expect(test.sessions.storedKeys()).toHaveLength(1);
    expect(withOldId.statusCode).toBe(401);
  });

  it('RF-1109 a successful and a failed sign-in are audited', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = new TestBrowser(test.server);

    await browser.signIn('amy', fixturePassword('Wrong'), { remoteAddress: '203.0.113.9' });
    await browser.signIn('amy', amy.password, { remoteAddress: '203.0.113.9' });

    const events = await test.audit.list({ since: 0, action: 'auth.sign_in' });
    expect(events.map((event) => [event.outcome, event.ip])).toEqual([
      ['ok', '203.0.113.9'],
      ['refused', '203.0.113.9'],
    ]);
  });
});

describe('POST /api/session refusals before any hashing', () => {
  it('RF-1009 a sign-in from another origin, or without one, is refused with 403 (DEC-112)', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = new TestBrowser(test.server);

    const foreign = await browser.signIn('amy', amy.password, { origin: 'https://evil.example' });
    const missing = await browser.signIn('amy', amy.password, { origin: null });

    for (const response of [foreign, missing]) {
      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: ERROR_CODES.originRefused });
    }
    expect(test.sessions.storedKeys()).toEqual([]);
  });
});

describe('POST /api/session caps', () => {
  it.each([
    ['a password over 1,024 characters', { userName: 'amy', password: 'p'.repeat(1025) }],
    ['an empty password', { userName: 'amy', password: '' }],
    ['a field it does not know', { userName: 'amy', password: 'p', remember: true }],
    ['a body over 4 KiB', { userName: 'amy', password: 'p', note: 'n'.repeat(5000) }],
  ])('RF-1100 %s is refused with 400 before the hasher runs', async (_case, payload) => {
    const hasher = new FakePasswordHasher();
    let verified = 0;
    const counting: PasswordHasher = {
      hash: (password) => hasher.hash(password),
      verify: (password, hash) => {
        verified += 1;
        return hasher.verify(password, hash);
      },
    };
    const test = serve({ hasher: counting });

    const response = await new TestBrowser(test.server).request({
      method: 'POST',
      url: '/api/session',
      payload,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
    expect(verified).toBe(0);
  });
});

describe('POST /api/session concurrency', () => {
  it('RF-1100 at most eight sign-ins are verified at a time; the next one gets 429', async () => {
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const inner = new FakePasswordHasher();
    let started = 0;
    const slow: PasswordHasher = {
      hash: (password) => inner.hash(password),
      verify: async (password, hash) => {
        started += 1;
        await held;
        return inner.verify(password, hash);
      },
    };
    const test = serve({ hasher: slow });
    const browser = new TestBrowser(test.server);
    const waiting = Array.from({ length: 8 }, (_unused, index) =>
      browser.signIn(`user${String(index)}`, 'p', {
        remoteAddress: `203.0.113.${String(index + 1)}`,
      }),
    );
    for (let turn = 0; turn < 1000 && started < 8; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    const ninth = await browser.signIn('amy', 'p', { remoteAddress: '198.51.100.1' });
    release();
    const answered = await Promise.all(waiting);

    expect(ninth.statusCode).toBe(429);
    expect(ninth.json()).toMatchObject({ code: ERROR_CODES.rateLimited });
    expect(answered.map((response) => response.statusCode)).toEqual(Array(8).fill(401));
  });
});

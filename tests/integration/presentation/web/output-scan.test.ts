import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { hashSessionId } from '../../../../src/infrastructure/security/session-ids.js';
import { ScryptPasswordHasher } from '../../../../src/infrastructure/security/scrypt-password-hasher.js';
import { createDummyHash } from '../../../../src/infrastructure/security/dummy-password-hash.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import {
  addUser,
  signedInBrowser,
  TestBrowser,
  type TestUser,
} from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1009: given any response, when it is sent, then it never contains a password hash, a session
// id other than in the cookie, a provider key or another secret. RF-1013: no session id or token
// ever appears in a URL. The flow below drives every session route through success, failure and
// refusal with the real scrypt hasher (small parameters), then scans every body and every header
// except Set-Cookie for the session ids, their SHA-256, the password hashes (and their salt and
// key), the passwords and the CSRF secrets.

const parameters = { cost: 2 ** 10, blockSize: 8, parallelization: 1 } as const;
const browsers: TestBrowser[] = [];
const users: TestUser[] = [];
let test: TestServer;

function cookieValues(responses: readonly LightMyRequestResponse[], name: string): string[] {
  return responses
    .flatMap((response) => response.cookies)
    .filter((cookie) => cookie.name === name && cookie.value !== '')
    .map((cookie) => cookie.value);
}

function forbiddenValues(responses: readonly LightMyRequestResponse[]): string[] {
  const sessionIds = cookieValues(responses, '__Host-rosetta_session');
  const hashes = sessionIds.map((id) => hashSessionId(id));
  const passwordHashes = users.map((user) => user.account.passwordHash);
  return [
    ...sessionIds,
    ...hashes.flatMap((hash) => [
      hash.toString('hex'),
      hash.toString('base64'),
      hash.toString('base64url'),
    ]),
    ...passwordHashes,
    ...passwordHashes.flatMap((hash) => hash.split('$').slice(4)),
    ...users.map((user) => user.password),
    ...cookieValues(responses, '__Host-rosetta_csrf'),
  ];
}

function visibleText(response: LightMyRequestResponse): string {
  const headers = Object.entries(response.headers)
    .filter(([name]) => name !== 'set-cookie')
    .map(([name, value]) => `${name}: ${String(value)}`);
  return [...headers, response.body].join('\n');
}

async function drive(): Promise<void> {
  const [amy, root] = users;
  if (amy === undefined || root === undefined) throw new Error('users missing');
  const anonymous = new TestBrowser(test.server);
  browsers.push(anonymous);
  await anonymous.signIn('amy', fixturePassword('Wrong'));
  await anonymous.signIn('nobody', fixturePassword('Wrong'));
  await anonymous.request({ method: 'GET', url: '/api/session' });
  await anonymous.request({ method: 'GET', url: '/projects' });
  for (const user of [amy, root]) {
    const browser = await signedInBrowser(test.server, user);
    browsers.push(browser);
    await browser.request({ method: 'GET', url: '/api/session' });
    await browser.request({ method: 'HEAD', url: '/api/session' });
    await browser.signIn(user.account.userName, user.password);
    await browser.request({ method: 'DELETE', url: '/api/session', csrf: false });
    await browser.request({
      method: 'DELETE',
      url: '/api/session',
      origin: 'https://evil.example',
    });
    await browser.request({ method: 'GET', url: '/api/missing' });
    await browser.request({ method: 'DELETE', url: '/api/session' });
    await browser.request({ method: 'GET', url: '/api/session' });
  }
}

beforeAll(async () => {
  const hasher = new ScryptPasswordHasher({ parameters });
  test = createTestServer({ hasher, dummyHash: await createDummyHash(hasher) });
  users.push(await addUser(test, { userName: 'amy' }));
  users.push(await addUser(test, { userName: 'root', role: 'admin' }));
  await drive();
});

afterAll(async () => {
  await test.server.close();
});

describe('output scan', () => {
  it('RF-1009 the flow issued session ids and CSRF secrets to scan for', () => {
    const responses = browsers.flatMap((browser) => browser.responses);

    expect(cookieValues(responses, '__Host-rosetta_session').length).toBeGreaterThanOrEqual(4);
    expect(cookieValues(responses, '__Host-rosetta_csrf').length).toBeGreaterThanOrEqual(2);
    expect(users.every((user) => user.account.passwordHash.startsWith('scrypt$'))).toBe(true);
  });

  it('RF-1009 no response body or header outside Set-Cookie holds a session id, a hash, a password or a CSRF secret', () => {
    const responses = browsers.flatMap((browser) => browser.responses);
    const forbidden = forbiddenValues(responses);

    for (const response of responses) {
      const text = visibleText(response);
      for (const value of forbidden) expect(text).not.toContain(value);
    }
  });

  it('RF-1009 no log entry holds a session id, a hash, a password or a CSRF secret', () => {
    const logged = test.logger.text();

    for (const value of forbiddenValues(browsers.flatMap((browser) => browser.responses))) {
      expect(logged).not.toContain(value);
    }
  });
});

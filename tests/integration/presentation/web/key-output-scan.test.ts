import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LightMyRequestResponse } from 'fastify';
import { fixtureKey } from '../../../support/provider-key-fixtures.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1104, RNF-003, RF-1109: no API ever returns a key, and no log entry or audit row holds one.
// The flow drives every key route through success, replacement, deletion, refusal (bad key, bad
// base URL, unknown provider, missing CSRF token, wrong Origin, no session) and listing, then scans
// every response (body and headers), the whole log and every audit row for each fixture key and for
// the key without its last four characters (the only part that may ever leave the server).

const keys = {
  amyOpenAi: fixtureKey('ScanAmyOpenAi'),
  amyReplacement: fixtureKey('ScanAmyOpenAi2'),
  amyCompatible: fixtureKey('ScanAmyCompat'),
  amyRefused: fixtureKey('ScanAmyRefused'),
  bobAnthropic: fixtureKey('ScanBobAnthropic'),
  anonymous: fixtureKey('ScanAnonymous'),
};
const forbidden = Object.values(keys).flatMap((key) => [key, key.slice(0, -4)]);
const browsers: TestBrowser[] = [];
let test: TestServer;
let bobId = '';

function put(browser: TestBrowser, provider: string, payload: Record<string, unknown>, extra = {}) {
  return browser.request({
    method: 'PUT',
    url: `/api/account/keys/${provider}`,
    payload,
    ...extra,
  });
}

async function driveAmy(amy: TestBrowser): Promise<void> {
  await put(amy, 'openai', { key: keys.amyOpenAi });
  await put(amy, 'openai', { key: keys.amyReplacement });
  await put(amy, 'openai-compatible', {
    key: keys.amyCompatible,
    baseUrl: 'https://llm.example.com/v1',
  });
  await put(amy, 'openai-compatible', {
    key: keys.amyRefused,
    baseUrl: 'https://inside.example.com/v1',
  });
  await put(amy, 'openai-compatible', {
    key: keys.amyRefused,
    baseUrl: 'http://llm.example.com/v1',
  });
  await put(amy, 'anthropic', { key: `${keys.amyRefused} with spaces` });
  await put(amy, 'ollama', { key: keys.amyRefused });
  await put(amy, 'openai', { key: keys.amyRefused }, { csrf: false });
  await put(amy, 'openai', { key: keys.amyRefused }, { origin: 'https://evil.example' });
  await put(amy, 'anthropic', { key: keys.amyRefused, extra: true });
  await amy.request({ method: 'GET', url: '/api/account/keys' });
  await amy.request({ method: 'HEAD', url: '/api/account/keys' });
  await amy.request({ method: 'DELETE', url: '/api/account/keys/openai' });
  await amy.request({ method: 'DELETE', url: '/api/account/keys/openai' });
  await amy.request({ method: 'GET', url: '/api/admin/audit' });
}

async function drive(): Promise<void> {
  const amy = await signedInBrowser(test.server, await addUser(test, { userName: 'amy' }));
  const bobUser = await addUser(test, { userName: 'bob' });
  bobId = bobUser.account.id;
  const bob = await signedInBrowser(test.server, bobUser);
  const root = await signedInBrowser(
    test.server,
    await addUser(test, { userName: 'root', role: 'admin' }),
  );
  const anonymous = new TestBrowser(test.server);
  browsers.push(amy, bob, root, anonymous);
  await driveAmy(amy);
  await put(bob, 'anthropic', { key: keys.bobAnthropic });
  await bob.request({ method: 'GET', url: '/api/account/keys' });
  await put(anonymous, 'openai', { key: keys.anonymous });
  await anonymous.request({ method: 'GET', url: '/api/account/keys' });
  await root.request({ method: 'GET', url: '/api/account/keys' });
  await root.request({ method: 'GET', url: '/api/admin/audit' });
}

function visibleText(response: LightMyRequestResponse): string {
  const headers = Object.entries(response.headers).map(
    ([name, value]) => `${name}: ${String(value)}`,
  );
  return [...headers, response.body].join('\n');
}

beforeAll(async () => {
  test = createTestServer();
  test.resolver.answer('llm.example.com', ['93.184.215.14']);
  test.resolver.answer('inside.example.com', ['10.0.0.7']);
  await drive();
});

afterAll(async () => {
  await test.server.close();
});

describe('key output scan', () => {
  it('RF-1104 the flow stored keys and wrote audit rows to scan', async () => {
    const audit = await test.audit.list({ since: 0 });

    expect((await test.keys.listForUser(bobId)).length).toBe(1);
    expect(audit.filter((event) => event.action.startsWith('key.')).length).toBeGreaterThanOrEqual(
      5,
    );
    expect(browsers.flatMap((browser) => browser.responses).length).toBeGreaterThanOrEqual(20);
  });

  it('RF-1104 no response body or header holds a key or more than its last four characters', () => {
    for (const response of browsers.flatMap((browser) => browser.responses)) {
      const text = visibleText(response);
      for (const value of forbidden) expect(text).not.toContain(value);
    }
  });

  it('RNF-003 no log entry holds a key', () => {
    const logged = test.logger.text();

    for (const value of forbidden) expect(logged).not.toContain(value);
  });

  it('RF-1109 no audit row holds a key', async () => {
    const rows = JSON.stringify(await test.audit.list({ since: 0 }));

    for (const value of forbidden) expect(rows).not.toContain(value);
  });
});

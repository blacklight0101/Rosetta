import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixtureKey } from '../../../support/provider-key-fixtures.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1104: the keys API under /api/account/keys. PUT saves or replaces the signed-in user's key
// for one provider and answers only its last four characters; GET lists provider, last four and
// update time; DELETE removes the row. An OpenAI-compatible base URL must be https and resolve to
// public addresses (RST-2304, checked with the fake resolver). RF-1105: a user sees only their own
// keys.

let test: TestServer;

afterEach(async () => {
  await test.server.close();
});

async function signedIn(userName: string): Promise<TestBrowser> {
  return signedInBrowser(test.server, await addUser(test, { userName }));
}

function put(browser: TestBrowser, provider: string, payload: Record<string, unknown>) {
  return browser.request({ method: 'PUT', url: `/api/account/keys/${provider}`, payload });
}

describe('keys API', () => {
  it('RF-1104 saves a key and answers only its last four characters', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');
    const key = fixtureKey('ApiSave01');

    const response = await put(amy, 'openai', { key });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      key: { provider: 'openai', last4: 've01', updatedAt: '2026-10-11T09:00:00.000Z' },
    });
    expect(response.body).not.toContain(key.slice(0, -4));
  });

  it('RF-1104 lists, replaces and deletes the keys of the signed-in user only', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');
    const bob = await signedIn('bob');
    await put(amy, 'openai', { key: fixtureKey('AmyFirst') });
    await put(bob, 'anthropic', { key: fixtureKey('BobFirst') });
    test.clock.advance(60_000);

    const replaced = await put(amy, 'openai', { key: fixtureKey('AmySecond') });
    const listed = await amy.request({ method: 'GET', url: '/api/account/keys' });
    const deleted = await amy.request({ method: 'DELETE', url: '/api/account/keys/openai' });
    const after = await amy.request({ method: 'GET', url: '/api/account/keys' });
    const bobs = await bob.request({ method: 'GET', url: '/api/account/keys' });

    expect(replaced.json()).toMatchObject({ key: { last4: 'cond' } });
    expect(listed.json()).toEqual({
      keys: [{ provider: 'openai', last4: 'cond', updatedAt: '2026-10-11T09:01:00.000Z' }],
    });
    expect(deleted.statusCode).toBe(204);
    expect(after.json()).toEqual({ keys: [] });
    expect(bobs.json()).toEqual({
      keys: [{ provider: 'anthropic', last4: 'irst', updatedAt: '2026-10-11T09:00:00.000Z' }],
    });
  });

  it('RF-1104 deleting a key the user does not have answers 404', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');

    const response = await amy.request({ method: 'DELETE', url: '/api/account/keys/anthropic' });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.notFound });
  });

  it.each(['ollama', 'fake', 'OPENAI'])(
    'RF-1104 a provider that takes no key (%s) answers 404',
    async (provider) => {
      test = createTestServer();
      const amy = await signedIn('amy');

      const response = await put(amy, provider, { key: fixtureKey('NoSuch1') });

      expect(response.statusCode).toBe(404);
    },
  );

  it.each([
    ['an unknown field', { key: fixtureKey('Extra1'), note: 'x' }],
    ['no key', {}],
    ['a key that is not text', { key: 42 }],
    [
      'a base URL for a provider that takes none',
      { key: fixtureKey('Url1'), baseUrl: 'https://llm.example.com' },
    ],
  ])('RF-1104 refuses a body with %s as an invalid request', async (_case, payload) => {
    test = createTestServer();
    const amy = await signedIn('amy');

    const response = await put(amy, 'openai', payload);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });

  it('RF-1104 refuses an unusable key value on the key field', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');

    const response = await put(amy, 'openai', { key: 'too-short' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: ERROR_CODES.providerKeyInvalid,
      problems: [{ field: 'key', code: ERROR_CODES.providerKeyInvalid }],
    });
  });
});

describe('keys API base URL', () => {
  it('RF-1104 saves an OpenAI-compatible key with an https base URL on a public address', async () => {
    test = createTestServer();
    test.resolver.answer('llm.example.com', ['93.184.215.14']);
    const amy = await signedIn('amy');

    const response = await put(amy, 'openai-compatible', {
      key: fixtureKey('Compat01'),
      baseUrl: 'https://llm.example.com/v1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      key: { provider: 'openai-compatible', last4: 'at01', updatedAt: '2026-10-11T09:00:00.000Z' },
    });
  });

  it.each([
    ['http', 'http://llm.example.com/v1'],
    ['a private address', 'https://192.168.1.20:8000/v1'],
    ['a name resolving to loopback', 'https://inside.example.com/v1'],
    ['a name resolving to an IPv4-mapped address', 'https://mapped.example.com/v1'],
    ['no base URL', undefined],
  ])('RF-1104 refuses %s with RST-2304 on the base URL field', async (_case, baseUrl) => {
    test = createTestServer();
    test.resolver.answer('inside.example.com', ['127.0.0.1']);
    test.resolver.answer('mapped.example.com', ['::ffff:10.0.0.1']);
    const user = await addUser(test, { userName: 'amy' });
    const amy = await signedInBrowser(test.server, user);

    const response = await put(amy, 'openai-compatible', {
      key: fixtureKey('Compat02'),
      ...(baseUrl === undefined ? {} : { baseUrl }),
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: ERROR_CODES.baseUrlRejected,
      message: 'The URL must use https and a public address.',
      problems: [{ field: 'baseUrl', code: ERROR_CODES.baseUrlRejected }],
    });
    expect(await test.keys.listForUser(user.account.id)).toEqual([]);
  });
});

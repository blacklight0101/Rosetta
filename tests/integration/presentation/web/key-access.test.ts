import { afterEach, describe, expect, it } from 'vitest';
import { fixtureKey } from '../../../support/provider-key-fixtures.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-436, RF-1104, DEC-225, P8-73: GET /api/account/key-access tells the settings page, for each
// provider that takes a key, whether the signed-in user saved a key of their own and whether they
// may use the server's key. Booleans only: no key and no part of one leaves the server, and another
// user's key does not count.

const url = '/api/account/key-access';

let test: TestServer;

afterEach(async () => {
  await test.server.close();
});

async function signedIn(userName: string, serverKeysAllowed = true): Promise<TestBrowser> {
  return signedInBrowser(test.server, await addUser(test, { userName, serverKeysAllowed }));
}

const putKey = (browser: TestBrowser, provider: string, key: string) =>
  browser.request({ method: 'PUT', url: `/api/account/keys/${provider}`, payload: { key } });

describe('key access API', () => {
  it('RF-436 lists each key provider with the own key and the server key the user may use', async () => {
    test = createTestServer();
    test.serverKeys.held.add('anthropic');
    const amy = await signedIn('amy');
    const key = fixtureKey('AccessOwn01');
    await putKey(amy, 'openai', key);

    const response = await amy.request({ method: 'GET', url });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      providers: [
        { provider: 'anthropic', ownKey: false, serverKey: true },
        { provider: 'openai', ownKey: true, serverKey: false },
        { provider: 'openai-compatible', ownKey: false, serverKey: false },
      ],
    });
    expect(response.body).not.toContain(key.slice(-4));
  });

  it('RF-436 a server key does not count for an account the administrator did not allow', async () => {
    test = createTestServer();
    test.serverKeys.held.add('anthropic');
    test.serverKeys.held.add('openai');
    const bob = await signedIn('bob', false);

    const response = await bob.request({ method: 'GET', url });

    expect(response.json()).toEqual({
      providers: [
        { provider: 'anthropic', ownKey: false, serverKey: false },
        { provider: 'openai', ownKey: false, serverKey: false },
        { provider: 'openai-compatible', ownKey: false, serverKey: false },
      ],
    });
  });
});

describe('key access API scope', () => {
  it("RF-436 another user's key does not count", async () => {
    test = createTestServer();
    const amy = await signedIn('amy');
    const bob = await signedIn('bob');
    await putKey(bob, 'anthropic', fixtureKey('BobsOwn01'));

    const response = await amy.request({ method: 'GET', url });

    expect(response.json()).toEqual({
      providers: [
        { provider: 'anthropic', ownKey: false, serverKey: false },
        { provider: 'openai', ownKey: false, serverKey: false },
        { provider: 'openai-compatible', ownKey: false, serverKey: false },
      ],
    });
  });

  it('RF-436 without a session the answer is 401', async () => {
    test = createTestServer();

    const response = await new TestBrowser(test.server).request({ method: 'GET', url });

    expect(response.statusCode).toBe(401);
  });
});

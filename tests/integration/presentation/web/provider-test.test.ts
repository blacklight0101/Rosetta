import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { describeError } from '../../../../src/domain/errors/descriptions.js';
import { contractScenarios } from '../../../contracts/llm-provider.contract.js';
import { recordingOf } from '../../../support/fake-recordings.js';
import { fixtureKey } from '../../../support/provider-key-fixtures.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-407, RF-1105, RF-1009, RF-1104: POST /api/account/providers/test checks every role of a new
// project with one tiny call through the guards and answers each as reachable or with its error and
// code; the cost of the calls is counted in the signed-in user's ledger. No key is ever answered.

let test: TestServer;

afterEach(async () => {
  await test.server.close();
});

async function signedIn(userName: string): Promise<TestBrowser> {
  return signedInBrowser(test.server, await addUser(test, { userName }));
}

function press(browser: TestBrowser) {
  return browser.request({ method: 'POST', url: '/api/account/providers/test' });
}

describe('POST /api/account/providers/test', () => {
  it('RF-407 answers each role reachable with its provider, model and cost', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');

    const response = await press(amy);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      roles: ['reader', 'verifier', 'planner', 'summariser'].map((role) => ({
        role,
        provider: 'ollama',
        model: 'gemma4:e4b',
        status: 'reachable',
        costMicros: '0',
        currency: 'USD',
      })),
    });
  });

  it("RF-407 counts the test calls in the user's ledger, as rows that belong to no run", async () => {
    test = createTestServer();
    const amy = await signedIn('amy');
    const bob = await signedIn('bob');

    await press(amy);
    await press(bob);

    const rows = test.providerLedger.entries;
    expect(rows).toHaveLength(8);
    expect(new Set(rows.map((row) => row.stage))).toEqual(new Set(['provider-test']));
    expect(new Set(rows.map((row) => row.userId)).size).toBe(2);
  });
});

describe('POST /api/account/providers/test failures and keys', () => {
  it('RF-407 shows the error, a plain message and the next step of a role that fails', async () => {
    const recordings = { ollama: recordingOf(contractScenarios['permanent-failure']) };
    test = createTestServer({ providerRecordings: recordings });
    const amy = await signedIn('amy');

    const response = await press(amy);

    expect(response.statusCode).toBe(200);
    const { roles } = response.json<{ roles: Record<string, unknown>[] }>();
    expect(roles.map((role) => role['status'])).toEqual(['failed', 'failed', 'failed', 'failed']);
    expect(roles[0]).toEqual({
      role: 'reader',
      provider: 'ollama',
      model: 'gemma4:e4b',
      status: 'failed',
      costMicros: '0',
      currency: 'USD',
      code: ERROR_CODES.providerCallFailed,
      ...describeError(ERROR_CODES.providerCallFailed),
    });
  });

  it('RF-1104 uses the key of the user for a role on OpenAI, and never answers it', async () => {
    const reader = { provider: 'openai', model: 'contract-model' } as const;
    test = createTestServer({ defaultRoles: { reader } });
    const amy = await signedIn('amy');
    const key = fixtureKey('TestRoute01');
    const before = await press(amy);
    await amy.request({ method: 'PUT', url: '/api/account/keys/openai', payload: { key } });

    const after = await press(amy);

    expect(before.json<{ roles: unknown[] }>().roles[0]).toMatchObject({
      role: 'reader',
      status: 'failed',
      code: ERROR_CODES.providerKeyMissing,
    });
    expect(after.json<{ roles: unknown[] }>().roles[0]).toMatchObject({
      role: 'reader',
      status: 'reachable',
    });
    expect(test.providerLedger.entries.map((row) => row.keySource)).toContain('user');
    expect(before.body + after.body).not.toContain(key.slice(0, -4));
  });
});

describe('POST /api/account/providers/test access', () => {
  it('RF-1105 refuses a visitor without a session', async () => {
    test = createTestServer();

    const response = await press(new TestBrowser(test.server));

    expect(response.statusCode).toBe(401);
  });

  it('RF-1009 refuses a request without the CSRF token', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');

    const response = await amy.request({
      method: 'POST',
      url: '/api/account/providers/test',
      csrf: false,
    });

    expect(response.statusCode).toBe(403);
    expect(test.providerLedger.entries).toEqual([]);
  });

  it('RF-1009 refuses a request from another origin', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');

    const response = await amy.request({
      method: 'POST',
      url: '/api/account/providers/test',
      origin: 'https://evil.example',
    });

    expect(response.statusCode).toBe(403);
    expect(test.providerLedger.entries).toEqual([]);
  });
});

describe('POST /api/account/providers/test limits', () => {
  it('RF-1100 limits the button to a few presses a minute, since each costs money', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');

    const statuses: number[] = [];
    for (let press_ = 0; press_ < 8; press_ += 1) statuses.push((await press(amy)).statusCode);

    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429, 429]);
  });

  it('RF-1100 limits the presses per user too: another address does not give a user more', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');

    const statuses: number[] = [];
    for (let n = 1; n <= 8; n += 1) {
      const from = `10.0.0.${String(n)}`;
      const response = await amy.request({
        method: 'POST',
        url: '/api/account/providers/test',
        remoteAddress: from,
      });
      statuses.push(response.statusCode);
    }

    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429, 429]);
  });

  it('RF-1100 one user reaching the limit does not stop another user on the same address', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');
    const bob = await signedIn('bob');
    for (let n = 0; n < 6; n += 1) await press(amy);

    const refused = await press(amy);
    const other = await press(bob);

    expect(refused.statusCode).toBe(429);
    expect(other.statusCode).toBe(200);
  });
});

describe('POST /api/account/providers/test limit log', () => {
  it('RF-009 a press refused by the per-user limit writes one security log entry without secrets', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');
    for (let n = 1; n <= 6; n += 1) {
      await amy.request({
        method: 'POST',
        url: '/api/account/providers/test',
        remoteAddress: `10.0.1.${String(n)}`,
      });
    }

    const refused = await amy.request({
      method: 'POST',
      url: '/api/account/providers/test',
      remoteAddress: '10.0.1.7',
    });

    expect(refused.statusCode).toBe(429);
    const events = test.logger.entries.filter(
      (entry) => entry.logger === 'security' && entry.code === ERROR_CODES.rateLimited,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ level: 'warn', data: { ip: '10.0.1.7' } });
    // RF-1109: the refused press is also audited.
    const rows = await test.audit.list({ since: 0, action: 'request.refused' });
    expect(rows).toEqual([
      expect.objectContaining({
        ip: '10.0.1.7',
        detail: { reason: 'rate-limit' },
      }),
    ]);
    const logged = JSON.stringify(events);
    for (const secret of [...amy.cookies.values(), amy.csrfToken ?? '']) {
      expect(secret).not.toBe('');
      expect(logged).not.toContain(secret);
    }
  });
});

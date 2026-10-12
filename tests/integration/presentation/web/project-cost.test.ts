import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { costEntry, costRunB, providerTestEntry } from '../../../support/cost-fixtures.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-428, RF-1010, RF-1106, RF-1105, DEC-49, P1-36: the cost page and the totals pill read a fixture
// ledger through GET /api/projects/:id/cost and GET /api/account/totals. Amounts travel as decimal
// strings of micro-dollars, tokens as numbers.

let test: TestServer;

afterEach(async () => {
  await test.server.close();
});

interface Signed {
  readonly browser: TestBrowser;
  readonly id: string;
}

async function signedIn(userName: string, role: 'user' | 'admin' = 'user'): Promise<Signed> {
  const user = await addUser(test, { userName, role });
  return { browser: await signedInBrowser(test.server, user), id: user.account.id };
}

async function projectOf(owner: Signed): Promise<string> {
  const created = await owner.browser.request({
    method: 'POST',
    url: '/api/projects',
    payload: { url: 'https://github.com/octo/webforms' },
  });
  const body: unknown = created.json();
  if (typeof body !== 'object' || body === null || !('id' in body) || typeof body.id !== 'string')
    throw new Error('The project was not created.');
  return body.id;
}

/** Amy's project with a paid call, a local call on another run and a call of an unpriced model. */
async function fixtureLedger(): Promise<{ amy: Signed; projectId: string }> {
  test = createTestServer();
  const amy = await signedIn('amy');
  const projectId = await projectOf(amy);
  test.costs.add(costEntry(amy.id, { projectId }));
  test.costs.add(
    costEntry(amy.id, {
      projectId,
      runId: costRunB,
      at: new Date('2026-10-12T11:00:00.000Z'),
      stage: 'verify',
      role: 'verifier',
      provider: 'ollama',
      model: 'gemma4:e4b',
      keySource: 'none',
      costMicros: 0n,
      priceTableVersion: '2026-10-12',
    }),
  );
  test.costs.add(providerTestEntry(amy.id, { costMicros: 3n }));
  return { amy, projectId };
}

const paidTotals = {
  calls: 1,
  inputTokens: 1000,
  outputTokens: 100,
  cachedInputTokens: 50,
  cost: [{ currency: 'USD', costMicros: '700' }],
  unknownCostCalls: 0,
  priceTableVersions: ['2026-10-11'],
};

describe('GET /api/projects/:id/cost', () => {
  it('RF-428 shows the project totals and the breakdown by run, stage, role, provider and model', async () => {
    const { amy, projectId } = await fixtureLedger();

    const response = await amy.browser.request({
      method: 'GET',
      url: `/api/projects/${projectId}/cost`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(body['project']).toEqual({ id: projectId, name: 'octo/webforms' });
    expect(body['totals']).toMatchObject({ calls: 2, inputTokens: 2000, cachedInputTokens: 100 });
    expect(body['byRun']).toEqual([
      expect.objectContaining({
        runId: costEntry(amy.id).runId,
        firstAt: '2026-10-12T10:00:00.000Z',
      }),
      expect.objectContaining({ runId: costRunB, local: true }),
    ]);
    expect(body['byStage']).toEqual([
      { key: 'understand', local: false, totals: paidTotals },
      expect.objectContaining({ key: 'verify' }),
    ]);
    expect(body['byRole']).toEqual([
      expect.objectContaining({ key: 'reader' }),
      expect.objectContaining({ key: 'verifier' }),
    ]);
    expect(body['byProvider']).toEqual([
      expect.objectContaining({ key: 'ollama', local: true }),
      { key: 'openai', local: false, totals: paidTotals },
    ]);
  });
});

describe('GET /api/projects/:id/cost provider tests', () => {
  it('RF-428 lists the user provider tests (no project, no run) as tests, outside the project totals', async () => {
    const { amy, projectId } = await fixtureLedger();

    const response = await amy.browser.request({
      method: 'GET',
      url: `/api/projects/${projectId}/cost`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<Record<string, unknown>>();
    expect(body['providerTests']).toEqual({
      key: 'provider-tests',
      local: false,
      totals: { ...paidTotals, cost: [{ currency: 'USD', costMicros: '3' }] },
    });
    expect(body['totals']).toMatchObject({ calls: 2 });
  });
});

describe('GET /api/projects/:id/cost lines and scope', () => {
  it('RF-428 shows a local model with its tokens and a cost of zero, and the price table it used', async () => {
    const { amy, projectId } = await fixtureLedger();

    const response = await amy.browser.request({
      method: 'GET',
      url: `/api/projects/${projectId}/cost`,
    });

    expect(response.statusCode).toBe(200);
    const models = response.json<{ byModel: unknown[] }>().byModel;
    expect(models).toContainEqual({
      key: 'ollama gemma4:e4b',
      provider: 'ollama',
      model: 'gemma4:e4b',
      local: true,
      totals: {
        ...paidTotals,
        cost: [{ currency: 'USD', costMicros: '0' }],
        priceTableVersions: ['2026-10-12'],
      },
    });
  });
  it('RF-1105 another user and an unknown project get the same 404', async () => {
    const { projectId } = await fixtureLedger();
    const bob = await signedIn('bob');

    const other = await bob.browser.request({
      method: 'GET',
      url: `/api/projects/${projectId}/cost`,
    });
    const unknown = await bob.browser.request({
      method: 'GET',
      url: '/api/projects/00000000-0000-4000-8000-00000000dead/cost',
    });

    expect(other.statusCode).toBe(404);
    expect(other.json()).toMatchObject({ code: ERROR_CODES.notFound });
    expect(unknown.json()).toEqual(other.json());
  });
});

describe('GET /api/account/totals', () => {
  it('RF-1010 a user gets the totals of their own projects and provider tests, and no server figures', async () => {
    const { amy } = await fixtureLedger();
    const bob = await signedIn('bob');
    test.costs.add(costEntry(bob.id, { costMicros: 900n }));

    const response = await amy.browser.request({ method: 'GET', url: '/api/account/totals' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      totals: {
        calls: 3,
        inputTokens: 3000,
        outputTokens: 300,
        cachedInputTokens: 150,
        cost: [{ currency: 'USD', costMicros: '703' }],
        unknownCostCalls: 0,
        priceTableVersions: ['2026-10-11', '2026-10-12'],
      },
      server: null,
    });
  });

  it('RF-1010 RF-1106 the administrator also gets the server month against the monthly cap', async () => {
    test = createTestServer();
    const root = await signedIn('root', 'admin');
    test.usage.addCost({
      userId: root.id,
      at: test.clock.now(),
      costMicros: 8_500_000n,
      currency: 'USD',
    });

    const response = await root.browser.request({ method: 'GET', url: '/api/account/totals' });

    expect(response.statusCode).toBe(200);
    expect(response.json<Record<string, unknown>>()['server']).toEqual({
      caps: { runMicros: '500000', userDayMicros: '1000000', serverMonthMicros: '10000000' },
      serverMonthToDate: [{ currency: 'USD', costMicros: '8500000' }],
    });
  });
});

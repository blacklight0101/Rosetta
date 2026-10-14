import { afterEach, describe, expect, it } from 'vitest';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1106, RF-1001, DEC-107, DEC-108 (P1-106): GET /api/account/limits tells every signed-in user
// what the start page needs for its estimate warning: what is left of their own day on the
// server's keys (the account's cap, else the server default), what is left of the server's month
// on its keys, and, when they set a cap on their own keys, what is left of that day. Amounts are
// decimal strings of micro-dollars; what is left is never below zero; spend on own keys is outside
// the server's totals, and another user's spend is outside the user's day.

let test: TestServer;

afterEach(async () => {
  await test.server.close();
});

const day = 24 * 3_600_000;

async function signedIn(userName: string, extra: { dailyCapMicros?: bigint } = {}) {
  const user = await addUser(test, { userName, ...extra });
  return { id: user.account.id, browser: await signedInBrowser(test.server, user) };
}

interface Amounts {
  readonly capMicros: string;
  readonly spentMicros: string;
  readonly remainingMicros: string;
}

interface Limits {
  readonly serverKeys: {
    readonly userDay: Amounts;
    readonly serverMonth: { readonly remainingMicros: string };
  };
  readonly ownKeys: { readonly day: Amounts | null };
}

async function limitsOf(browser: TestBrowser): Promise<Limits> {
  const response = await browser.request({ method: 'GET', url: '/api/account/limits' });
  return response.json<Limits>();
}

describe('GET /api/account/limits', () => {
  it('RF-1106 with no spend, a user sees the whole default day and month: $1.00 and $10.00', async () => {
    test = createTestServer();
    const { browser } = await signedIn('amy');

    expect(await limitsOf(browser)).toEqual({
      serverKeys: {
        userDay: { capMicros: '1000000', spentMicros: '0', remainingMicros: '1000000' },
        serverMonth: { remainingMicros: '10000000' },
      },
      ownKeys: { day: null },
    });
  });

  it("RF-1001 the day counts only the user's server-key spend of today", async () => {
    test = createTestServer();
    const { id, browser } = await signedIn('amy');
    const other = await signedIn('bob');
    const now = test.clock.now();
    const row = { currency: 'USD', keySource: 'server' as const };
    test.usage.addCost({ ...row, userId: id, at: now, costMicros: 400_000n });
    test.usage.addCost({ ...row, userId: id, at: new Date(now.getTime() - day), costMicros: 9n });
    test.usage.addCost({ ...row, userId: other.id, at: now, costMicros: 300_000n });
    test.usage.addCost({
      userId: id,
      at: now,
      costMicros: 70_000n,
      currency: 'USD',
      keySource: 'user',
    });

    const limits = await limitsOf(browser);

    expect(limits.serverKeys.userDay).toEqual({
      capMicros: '1000000',
      spentMicros: '400000',
      remainingMicros: '600000',
    });
  });
});

describe('GET /api/account/limits: the server month', () => {
  it("RF-1106 the month counts every user's server-key spend and leaves out spend on own keys", async () => {
    test = createTestServer();
    const { id, browser } = await signedIn('amy');
    const other = await signedIn('bob');
    const now = test.clock.now();
    const row = { currency: 'USD', at: now };
    test.usage.addCost({ ...row, userId: id, costMicros: 1_000_000n, keySource: 'server' });
    test.usage.addCost({ ...row, userId: other.id, costMicros: 2_500_000n, keySource: 'server' });
    test.usage.addCost({ ...row, userId: other.id, costMicros: 3_000_000n, keySource: 'user' });

    const limits = await limitsOf(browser);

    expect(limits.serverKeys.serverMonth).toEqual({ remainingMicros: '6500000' });
  });
});

describe('GET /api/account/limits: caps and refusals', () => {
  it("RF-1106 the account's own cap set by the administrator replaces the server default for the day", async () => {
    test = createTestServer();
    const { browser } = await signedIn('amy', { dailyCapMicros: 2_500_000n });

    const limits = await limitsOf(browser);

    expect(limits.serverKeys.userDay).toMatchObject({ capMicros: '2500000' });
  });

  it('RF-1106 what is left is never below zero when the spend passed the cap', async () => {
    test = createTestServer();
    const { id, browser } = await signedIn('amy');
    test.usage.addCost({
      ...{ userId: id, currency: 'USD', keySource: 'server' as const },
      at: test.clock.now(),
      costMicros: 12_000_000n,
    });

    const limits = await limitsOf(browser);

    expect(limits.serverKeys.userDay.remainingMicros).toBe('0');
    expect(limits.serverKeys.serverMonth.remainingMicros).toBe('0');
  });
});

describe('GET /api/account/limits: own keys and sessions', () => {
  it('DEC-107 a user with a daily cap on their own keys sees what is left of it, from own-key spend only', async () => {
    test = createTestServer();
    const { id, browser } = await signedIn('amy');
    await browser.request({
      method: 'PUT',
      url: '/api/account/daily-cap',
      payload: { ownDailyCapMicros: '1500000' },
    });
    const row = { userId: id, currency: 'USD', at: test.clock.now() };
    test.usage.addCost({ ...row, costMicros: 500_000n, keySource: 'user' });
    test.usage.addCost({ ...row, costMicros: 200_000n, keySource: 'server' });

    const limits = await limitsOf(browser);

    expect(limits.ownKeys).toEqual({
      day: { capMicros: '1500000', spentMicros: '500000', remainingMicros: '1000000' },
    });
  });

  it('RF-1100 a visitor without a session is refused', async () => {
    test = createTestServer();

    const response = await test.server.inject({ method: 'GET', url: '/api/account/limits' });

    expect(response.statusCode).toBe(401);
  });
});

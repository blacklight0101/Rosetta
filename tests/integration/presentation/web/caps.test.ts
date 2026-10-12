import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1106, DEC-107, RF-1109: the administrator reads and sets the server caps (run, user day,
// server month) under /api/admin/caps; every user reads and sets the optional daily cap on their
// own keys under /api/account/daily-cap. Amounts travel as decimal strings of micro-dollars, so
// none is rounded; every change writes an audit row.

let test: TestServer;

afterEach(async () => {
  await test.server.close();
});

async function signedIn(userName: string, role: 'user' | 'admin' = 'user'): Promise<TestBrowser> {
  return signedInBrowser(test.server, await addUser(test, { userName, role }));
}

const newCaps = {
  runMicros: '250000',
  userDayMicros: '2000000',
  serverMonthMicros: '9007199254740991',
};

describe('server caps API', () => {
  it('RF-1106 the administrator reads the default caps: $0.50 a run, $1.00 a user day, $10.00 a month', async () => {
    test = createTestServer();
    const root = await signedIn('root', 'admin');

    const response = await root.request({ method: 'GET', url: '/api/admin/caps' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      caps: { runMicros: '500000', userDayMicros: '1000000', serverMonthMicros: '10000000' },
      serverMonthToDate: [],
    });
  });

  it('RF-1106 the administrator sets the caps; the change is kept and audited', async () => {
    test = createTestServer();
    const root = await signedIn('root', 'admin');

    const saved = await root.request({ method: 'PUT', url: '/api/admin/caps', payload: newCaps });
    const read = await root.request({ method: 'GET', url: '/api/admin/caps' });

    expect(saved.statusCode).toBe(200);
    expect(read.json()).toEqual({ caps: newCaps, serverMonthToDate: [] });
    const [event] = await test.audit.list({ since: 0, action: 'admin.caps_changed' });
    expect(event).toMatchObject({ outcome: 'ok', targetType: 'server_settings', targetId: 'caps' });
    expect(event?.detail).toMatchObject({ runMicros: '250000', previousRunMicros: '500000' });
  });

  it('RF-1106 a negative cap is refused with RST-1003 on its field, and nothing changes', async () => {
    test = createTestServer();
    const root = await signedIn('root', 'admin');

    const refused = await root.request({
      method: 'PUT',
      url: '/api/admin/caps',
      payload: { ...newCaps, userDayMicros: '-1' },
    });

    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({
      code: ERROR_CODES.settingsInvalid,
      problems: [{ field: 'userDayMicros', code: ERROR_CODES.settingsCapNegative }],
    });
    const read = await root.request({ method: 'GET', url: '/api/admin/caps' });
    expect(read.json()).toMatchObject({ caps: { userDayMicros: '1000000' } });
  });
});

describe('server month to date', () => {
  it('RF-1106 the month to date counts server-key spend only, not spend on own keys', async () => {
    test = createTestServer();
    const root = await signedIn('root', 'admin');
    const amy = await addUser(test, { userName: 'amy', role: 'user' });
    const at = new FixedClock('2026-10-05T00:00:00.000Z').now();
    const row = { userId: amy.account.id, at, currency: 'USD' };
    test.usage.addCost({ ...row, costMicros: 3_000_000n, keySource: 'user' });
    test.usage.addCost({ ...row, costMicros: 1_250_000n, keySource: 'server' });

    const response = await root.request({ method: 'GET', url: '/api/admin/caps' });

    expect(response.json()).toMatchObject({
      serverMonthToDate: [{ currency: 'USD', costMicros: '1250000' }],
    });
  });
});

describe('server caps API validation', () => {
  it.each([
    ['a fraction', { ...newCaps, runMicros: '1.5' }],
    ['a number instead of a string', { ...newCaps, runMicros: 5 }],
    ['a missing cap', { runMicros: '1', userDayMicros: '1' }],
    ['an unknown field', { ...newCaps, extra: '1' }],
    ['too many digits', { ...newCaps, runMicros: '1'.repeat(19) }],
    [
      'an amount beyond the largest safe whole number',
      { ...newCaps, runMicros: '9007199254740992' },
    ],
  ])('RF-1106 %s is refused as an invalid request', async (_name, payload) => {
    test = createTestServer();
    const root = await signedIn('root', 'admin');

    const refused = await root.request({ method: 'PUT', url: '/api/admin/caps', payload });

    expect(refused.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });
});

describe('own daily cap API (DEC-107)', () => {
  it('RF-1106 a user has no own daily cap by default', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');

    const response = await amy.request({ method: 'GET', url: '/api/account/daily-cap' });

    expect(response.json()).toEqual({ ownDailyCapMicros: null });
  });

  it('RF-1106 a user sets, reads and removes their own daily cap; each change is audited', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');
    const bob = await signedIn('bob');

    const saved = await amy.request({
      method: 'PUT',
      url: '/api/account/daily-cap',
      payload: { ownDailyCapMicros: '1500000' },
    });
    const read = await amy.request({ method: 'GET', url: '/api/account/daily-cap' });
    const bobs = await bob.request({ method: 'GET', url: '/api/account/daily-cap' });
    const removed = await amy.request({
      method: 'PUT',
      url: '/api/account/daily-cap',
      payload: { ownDailyCapMicros: null },
    });

    expect(saved.json()).toEqual({ ownDailyCapMicros: '1500000' });
    expect(read.json()).toEqual({ ownDailyCapMicros: '1500000' });
    expect(bobs.json()).toEqual({ ownDailyCapMicros: null });
    expect(removed.json()).toEqual({ ownDailyCapMicros: null });
    const events = await test.audit.list({ since: 0, action: 'user.own_daily_cap_changed' });
    expect(events.map((event) => event.detail)).toEqual([
      { ownDailyCapMicros: null, previousOwnDailyCapMicros: '1500000' },
      { ownDailyCapMicros: '1500000', previousOwnDailyCapMicros: null },
    ]);
  });
});

describe('own daily cap API validation (DEC-107)', () => {
  it('RF-1106 a negative own cap is refused with RST-1003', async () => {
    test = createTestServer();
    const amy = await signedIn('amy');

    const refused = await amy.request({
      method: 'PUT',
      url: '/api/account/daily-cap',
      payload: { ownDailyCapMicros: '-5' },
    });

    expect(refused.statusCode).toBe(400);
    expect(refused.json()).toMatchObject({
      problems: [{ field: 'ownDailyCapMicros', code: ERROR_CODES.settingsCapNegative }],
    });
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import { FixedClock } from '../../../support/fixed-clock.js';
import {
  addUser,
  signedInBrowser,
  TestBrowser,
  type TestUser,
} from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1102: the administrator creates accounts, disables and enables them, resets passwords and
// lists every account with last sign-in, projects and month-to-date cost; the change takes effect
// at once (RF-1101). RF-1109: every change is audited, the audit view filters the last 30 days by
// user and action, and no row holds a password. Each refusal answers its code and status.

const initial = fixturePassword('Initial');
let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

interface Setup {
  readonly test: TestServer;
  readonly root: TestUser;
  readonly amy: TestUser;
  readonly admin: TestBrowser;
}

async function setup(): Promise<Setup> {
  const test = createTestServer();
  current = test;
  const root = await addUser(test, { userName: 'root', role: 'admin' });
  const amy = await addUser(test, { userName: 'amy' });
  return { test, root, amy, admin: await signedInBrowser(test.server, root) };
}

function post(browser: TestBrowser, url: string, payload: Record<string, unknown> = {}) {
  return browser.request({ method: 'POST', url, payload });
}

const newUser = { userName: 'teacher', displayName: 'Teacher', role: 'user', password: initial };

describe('POST /api/admin/users', () => {
  it('RF-1102 creates an account that must change its password at first sign-in', async () => {
    const { test, admin } = await setup();

    const response = await post(admin, '/api/admin/users', newUser);

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      user: { userName: 'teacher', role: 'user', state: 'MustChangePassword', lastSignInAt: null },
    });
    const signedIn = await new TestBrowser(test.server).signIn('teacher', initial);
    expect(signedIn.json()).toMatchObject({ user: { state: 'MustChangePassword' } });
  });

  it('RF-1107 creates the teacher account without a forced change', async () => {
    const { admin } = await setup();

    const response = await post(admin, '/api/admin/users', {
      ...newUser,
      mustChangePassword: false,
    });

    expect(response.json()).toMatchObject({ user: { state: 'Active' } });
  });

  it.each([
    ['a taken user name', { userName: 'AMY' }, [409, ERROR_CODES.userNameTaken, 'userName']],
    ['an invalid user name', { userName: 'a' }, [400, ERROR_CODES.userNameInvalid, 'userName']],
    [
      'an empty display name',
      { displayName: '' },
      [400, ERROR_CODES.displayNameInvalid, 'displayName'],
    ],
    [
      'a short password',
      { password: 'Short-pw1' },
      [400, ERROR_CODES.passwordTooShort, 'password'],
    ],
  ] as const)('RF-1102 refuses %s', async (_case, change, [status, code, field]) => {
    const { admin } = await setup();

    const response = await post(admin, '/api/admin/users', { ...newUser, ...change });

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ code, problems: [{ field, code }] });
  });
});

describe('POST /api/admin/users caps', () => {
  it.each([
    ['an unknown role', { role: 'owner' }],
    ['a password over 1,024 characters', { password: 'x'.repeat(1025) }],
    ['an unknown field', { extra: true }],
  ])('RF-1102 refuses %s with 400', async (_case, change) => {
    const { admin } = await setup();

    const response = await post(admin, '/api/admin/users', { ...newUser, ...change });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.requestInvalid });
  });

  it('RF-1102 refuses a body over 4 KiB with 400', async () => {
    const { admin } = await setup();

    const response = await post(admin, '/api/admin/users', {
      ...newUser,
      displayName: 'x'.repeat(5000),
    });

    expect(response.statusCode).toBe(400);
  });
});

describe('POST /api/admin/users/:id/disable and /enable', () => {
  it('RF-1101 disabling ends the sessions of the account at once', async () => {
    const { test, amy, admin } = await setup();
    const amyBrowser = await signedInBrowser(test.server, amy);

    const response = await post(admin, `/api/admin/users/${amy.account.id}/disable`);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ user: { id: amy.account.id, state: 'Disabled' } });
    expect((await amyBrowser.request({ method: 'GET', url: '/api/session' })).statusCode).toBe(401);
    expect((await new TestBrowser(test.server).signIn('amy', amy.password)).statusCode).toBe(401);
  });

  it('RF-1102 enabling lets the account sign in again', async () => {
    const { test, amy, admin } = await setup();
    await post(admin, `/api/admin/users/${amy.account.id}/disable`);

    const response = await post(admin, `/api/admin/users/${amy.account.id}/enable`);

    expect(response.json()).toMatchObject({ user: { state: 'Active' } });
    expect((await new TestBrowser(test.server).signIn('amy', amy.password)).statusCode).toBe(200);
  });

  it.each([
    ['enabling an active account', ['amy', 'enable'], 409, ERROR_CODES.accountStateInvalid],
    ['disabling your own account', ['root', 'disable'], 409, ERROR_CODES.ownAccountRefused],
    ['an unknown account', ['unknown', 'disable'], 404, ERROR_CODES.notFound],
    ['an id that is not a UUID', ['not-a-uuid', 'disable'], 404, ERROR_CODES.notFound],
  ] as const)('RF-1102 refuses %s', async (_case, [who, action], status, code) => {
    const { root, amy, admin } = await setup();
    const ids: Record<string, string> = {
      amy: amy.account.id,
      root: root.account.id,
      unknown: '00000000-0000-4000-9000-0000000000ff',
      'not-a-uuid': 'not-a-uuid',
    };

    const response = await post(admin, `/api/admin/users/${ids[who] ?? ''}/${action}`);

    expect(response.statusCode).toBe(status);
    expect(response.json()).toMatchObject({ code });
  });
});

describe('POST /api/admin/users/:id/password', () => {
  it('RF-1102 resets the password: sessions end and a change is required', async () => {
    const { test, amy, admin } = await setup();
    const amyBrowser = await signedInBrowser(test.server, amy);
    const resetTo = fixturePassword('Reset');

    const response = await post(admin, `/api/admin/users/${amy.account.id}/password`, {
      password: resetTo,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ user: { state: 'MustChangePassword' } });
    expect((await amyBrowser.request({ method: 'GET', url: '/api/session' })).statusCode).toBe(401);
    expect((await new TestBrowser(test.server).signIn('amy', resetTo)).statusCode).toBe(200);
  });

  it('RF-1102 refuses a password that breaks a rule', async () => {
    const { amy, admin } = await setup();

    const response = await post(admin, `/api/admin/users/${amy.account.id}/password`, {
      password: 'amy-reset-phrase-2026',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: ERROR_CODES.passwordContainsUserName,
      problems: [{ field: 'password' }],
    });
  });
});

describe('GET /api/admin/users', () => {
  it('RF-1102 lists every account with last sign-in, projects and month-to-date cost', async () => {
    const { test, amy, admin } = await setup();
    test.usage.addProject(amy.account.id);
    test.usage.addCost({
      userId: amy.account.id,
      at: new FixedClock('2026-10-05T00:00:00.000Z').now(),
      costMicros: 125_000n,
      currency: 'USD',
    });

    const response = await admin.request({ method: 'GET', url: '/api/admin/users' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      users: [
        {
          id: amy.account.id,
          userName: 'amy',
          displayName: 'Sample User',
          role: 'user',
          state: 'Active',
          createdAt: '2026-10-11T09:00:00.000Z',
          lastSignInAt: null,
          projects: 1,
          monthToDate: [{ currency: 'USD', costMicros: '125000' }],
          serverKeysAllowed: true,
        },
        expect.objectContaining({
          userName: 'root',
          lastSignInAt: '2026-10-11T09:00:00.000Z',
          projects: 0,
          monthToDate: [],
        }),
      ],
    });
    expect(response.body).not.toContain('fake$');
  });
});

describe('GET /api/admin/audit', () => {
  it('RF-1109 lists the account changes, filtered by user and action, without passwords', async () => {
    const { root, amy, admin } = await setup();
    const resetTo = fixturePassword('Reset');
    await post(admin, '/api/admin/users', newUser);
    await post(admin, `/api/admin/users/${amy.account.id}/password`, { password: resetTo });

    const all = await admin.request({ method: 'GET', url: '/api/admin/audit' });
    const filtered = await admin.request({
      method: 'GET',
      url: `/api/admin/audit?userId=${root.account.id}&action=user.password_reset`,
    });

    expect(all.statusCode).toBe(200);
    expect(all.json()).toMatchObject({ since: '2026-09-11T09:00:00.000Z', truncated: false });
    expect(filtered.json()).toEqual({
      since: '2026-09-11T09:00:00.000Z',
      truncated: false,
      events: [
        expect.objectContaining({ action: 'user.password_reset', targetId: amy.account.id }),
      ],
    });
    expect(all.body).not.toContain(resetTo);
    expect(all.body).not.toContain(initial);
  });

  it('RF-1109 narrows the list to a period and an outcome', async () => {
    const { admin } = await setup();
    await post(admin, '/api/admin/users', newUser);

    const day = await admin.request({ method: 'GET', url: '/api/admin/audit?days=1' });
    const refused = await admin.request({
      method: 'GET',
      url: '/api/admin/audit?days=7&outcome=refused',
    });

    expect(day.statusCode).toBe(200);
    expect(day.json()).toMatchObject({ since: '2026-10-10T09:00:00.000Z' });
    expect(refused.json()).toMatchObject({ since: '2026-10-04T09:00:00.000Z', events: [] });
  });

  it.each([
    ['a user id that is not a UUID', '?userId=nope'],
    ['an action with other characters', '?action=DROP%20TABLE'],
    ['an unknown parameter', '?since=0'],
    ['a period that is not offered', '?days=2'],
    ['an unknown outcome', '?outcome=maybe'],
  ])('RF-1109 refuses %s with 400', async (_case, query) => {
    const { admin } = await setup();

    const response = await admin.request({ method: 'GET', url: `/api/admin/audit${query}` });

    expect(response.statusCode).toBe(400);
  });
});

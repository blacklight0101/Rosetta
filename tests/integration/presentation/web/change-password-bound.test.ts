import { afterEach, describe, expect, it } from 'vitest';
import type { PasswordHasher } from '../../../../src/application/ports/password-hasher.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FakePasswordHasher, fixturePassword } from '../../../support/account-fixtures.js';
import { addUser, signedInBrowser, type TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1100, RF-1109, P1-160 (F-14): at most eight password changes are verified at a time; the next
// one answers 429 RST-2005 and, like every refused request, writes a `request.refused` audit row
// with its actor and a security event (one row per refusal).

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

/** A hasher whose `verify` waits, once `hold` is on, until `release` is called. */
function slowHasher() {
  const inner = new FakePasswordHasher();
  const state = { hold: false, started: 0, release: (): void => undefined };
  const held = new Promise<void>((resolve) => {
    state.release = resolve;
  });
  const hasher: PasswordHasher = {
    hash: (password) => inner.hash(password),
    verify: async (password, hash) => {
      if (state.hold) {
        state.started += 1;
        await held;
      }
      return inner.verify(password, hash);
    },
  };
  return { hasher, state };
}

async function signedIn(test: TestServer, count: number) {
  const users = [];
  for (let index = 0; index < count; index += 1) {
    const user = await addUser(test, { userName: `user${String(index)}` });
    users.push({ user, browser: await signedInBrowser(test.server, user) });
  }
  return users;
}

function change(browser: TestBrowser, currentPassword: string, label: string) {
  const payload = { currentPassword, newPassword: fixturePassword(label) };
  return browser.request({ method: 'POST', url: '/api/account/password', payload });
}

type SignedIn = Awaited<ReturnType<typeof signedIn>>;

/** Starts eight changes and waits until each is verifying (held by the slow hasher). */
async function eightHeld(users: SignedIn, state: ReturnType<typeof slowHasher>['state']) {
  state.hold = true;
  const waiting = users
    .slice(0, 8)
    .map(({ user, browser }, index) => change(browser, user.password, `Next${String(index)}`));
  for (let turn = 0; turn < 1000 && state.started < 8; turn += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  return waiting;
}

describe('POST /api/account/password concurrency', () => {
  it('RF-1109 the ninth change while eight are verified gets 429, audited with its actor and logged', async () => {
    const { hasher, state } = slowHasher();
    const test = createTestServer({ hasher });
    current = test;
    const users = await signedIn(test, 9);
    const waiting = await eightHeld(users, state);
    const ninth = users[8];
    if (ninth === undefined) throw new Error('nine users were signed in');

    const refused = await change(ninth.browser, ninth.user.password, 'Ninth');
    state.release();
    const answered = await Promise.all(waiting);

    expect(state.started).toBe(8);
    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ code: ERROR_CODES.rateLimited });
    expect(answered.map((response) => response.statusCode)).toEqual(Array(8).fill(200));
    const rows = await test.audit.list({ since: 0, action: 'request.refused' });
    expect(
      rows.map(({ actorUserId, targetId, detail }) => ({ actorUserId, targetId, detail })),
    ).toEqual([
      {
        actorUserId: ninth.user.account.id,
        targetId: 'POST /api/account/password',
        detail: { reason: 'rate-limit' },
      },
    ]);
    expect(test.logger.entries).toContainEqual(
      expect.objectContaining({ level: 'warn', logger: 'security', code: ERROR_CODES.rateLimited }),
    );
  });
});

describe('POST /api/account/password after the bound', () => {
  it('RF-1100 a change after the eight have ended is verified again', async () => {
    const { hasher, state } = slowHasher();
    const test = createTestServer({ hasher });
    current = test;
    const users = await signedIn(test, 9);
    state.hold = true;
    state.release();
    await Promise.all(
      users
        .slice(0, 8)
        .map(({ user, browser }, index) => change(browser, user.password, `N${String(index)}`)),
    );
    const ninth = users[8];
    if (ninth === undefined) throw new Error('nine users were signed in');

    const response = await change(ninth.browser, ninth.user.password, 'Ninth');

    expect(response.statusCode).toBe(200);
    expect(await test.audit.list({ since: 0, action: 'request.refused' })).toEqual([]);
  });
});

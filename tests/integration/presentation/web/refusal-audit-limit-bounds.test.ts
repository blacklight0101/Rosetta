import { afterEach, describe, expect, it } from 'vitest';
import type { PasswordHasher } from '../../../../src/application/ports/password-hasher.js';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { FakePasswordHasher, fixturePassword } from '../../../support/account-fixtures.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1109, DEC-141 (P1-157): the 429 of the password-change in-flight bound shares the one
// per-address limit of every `request.refused` writer; past 30 rows in the minute it writes no row
// of its own and is counted in the minute's `rate-limit` row. `inject` sends from 127.0.0.1.

const MINUTE = 60_000;
const address = '127.0.0.1';

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

describe('refusal rows of the password-change bound', () => {
  it('RF-1109 the in-flight bound of password change shares the per-address limit', async () => {
    const { hasher, state } = slowHasher();
    const test = createTestServer({ hasher });
    current = test;
    const users = await signedIn(test, 9);
    const stranger = new TestBrowser(test.server);
    for (let index = 0; index < 30; index += 1) {
      await stranger.request({ method: 'POST', url: '/api/projects', origin: null });
    }
    state.hold = true;
    const waiting = users
      .slice(0, 8)
      .map(({ user, browser }, index) => change(browser, user.password, `Next${String(index)}`));
    for (let turn = 0; turn < 1000 && state.started < 8; turn += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const ninth = users[8];
    if (ninth === undefined) throw new Error('nine users were signed in');

    const refused = await change(ninth.browser, ninth.user.password, 'Ninth');
    state.release();
    await Promise.all(waiting);
    test.clock.advance(MINUTE);
    await stranger.request({
      method: 'POST',
      url: '/api/projects',
      origin: null,
      remoteAddress: '198.51.100.7',
    });

    expect(refused.statusCode).toBe(429);
    expect(refused.json()).toMatchObject({ code: ERROR_CODES.rateLimited });
    const rows = (await test.audit.list({ since: 0, action: 'request.refused' })).filter(
      (row) => row.ip === address,
    );
    expect(rows).toHaveLength(31);
    expect(rows.some((row) => row.targetId === 'POST /api/account/password')).toBe(false);
    expect(rows.find((row) => 'count' in row.detail)?.detail).toMatchObject({ count: 1 });
  });
});

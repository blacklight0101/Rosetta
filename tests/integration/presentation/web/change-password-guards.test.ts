import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1103, RF-1102: POST /api/account/password refuses a new password equal to the current one
// (400 RST-2214 on the new-password field), so a forced change cannot keep the password. RF-1100,
// DEC-112: wrong current passwords count toward the sign-in failure window; the fifth locks the
// account, and sign-in is refused too.

let current: TestServer | undefined;

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

function change(browser: TestBrowser, currentPassword: string, newPassword: string) {
  return browser.request({
    method: 'POST',
    url: '/api/account/password',
    payload: { currentPassword, newPassword },
  });
}

describe('POST /api/account/password guards', () => {
  it('RF-1103 refuses the current password as the new one with 400 RST-2214', async () => {
    current = createTestServer();
    const mia = await addUser(current, { userName: 'mia', state: 'MustChangePassword' });
    const browser = await signedInBrowser(current.server, mia);

    const response = await change(browser, mia.password, mia.password);
    const projects = await browser.request({ method: 'GET', url: '/api/projects' });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: ERROR_CODES.passwordUnchanged,
      problems: [{ field: 'newPassword', code: ERROR_CODES.passwordUnchanged }],
    });
    expect(projects.statusCode).toBe(403);
  });

  it('RF-1100 five wrong current passwords lock the account for sign-in too', async () => {
    current = createTestServer();
    const amy = await addUser(current, { userName: 'amy' });
    const browser = await signedInBrowser(current.server, amy);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await change(browser, fixturePassword('Wrong'), fixturePassword('Renewed'));
    }

    const right = await change(browser, amy.password, fixturePassword('Renewed'));
    const signIn = await new TestBrowser(current.server).signIn('amy', amy.password);

    expect(right.statusCode).toBe(400);
    expect(signIn.statusCode).toBe(401);
    expect(await current.audit.list({ since: 0, action: 'auth.locked' })).toHaveLength(1);
  });
});

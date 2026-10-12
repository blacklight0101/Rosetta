import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../../../../src/domain/errors/codes.js';
import { fixturePassword } from '../../../support/account-fixtures.js';
import { addUser, signedInBrowser, TestBrowser } from '../../../support/test-browser.js';
import { createTestServer, type TestServer } from '../../../support/web-server.js';

// RF-1103: POST /api/account/password changes the signed-in user's password with the current one;
// the new one must meet the rules, the other sessions end and this browser gets a new session.
// RF-1102: a signed-in user in MustChangePassword reaches only the change-password route and page,
// the session API and sign-out: other API routes answer 403 RST-2212, other pages redirect to the
// change-password page (/account/password, which the app shell serves). The password fields are
// capped at 1,024 characters and the body at 4 KiB, as for sign-in (P1-09).

const staticRoot = fileURLToPath(new URL('../../../fixtures/static-site/', import.meta.url));
const newPassword = fixturePassword('Renewed');
let current: TestServer | undefined;

function serve(): TestServer {
  current = createTestServer({ staticRoot });
  return current;
}

afterEach(async () => {
  await current?.server.close();
  current = undefined;
});

function change(browser: TestBrowser, payload: Record<string, unknown>) {
  return browser.request({ method: 'POST', url: '/api/account/password', payload });
}

describe('POST /api/account/password', () => {
  it('RF-1103 changes the password, rotates this session and ends the other ones', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const here = await signedInBrowser(test.server, amy);
    const elsewhere = await signedInBrowser(test.server, amy);
    const before = here.cookies.get('__Host-rosetta_session');

    const response = await change(here, { currentPassword: amy.password, newPassword });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ user: { userName: 'amy', state: 'Active' } });
    expect(here.cookies.get('__Host-rosetta_session')).not.toBe(before);
    expect((await here.request({ method: 'GET', url: '/api/session' })).statusCode).toBe(200);
    expect((await elsewhere.request({ method: 'GET', url: '/api/session' })).statusCode).toBe(401);
    expect((await new TestBrowser(test.server).signIn('amy', newPassword)).statusCode).toBe(200);
  });

  it.each([
    ['shorter than 12 characters', 'Short-pw1', ERROR_CODES.passwordTooShort],
    ['containing the user name', 'my-amy-password-phrase', ERROR_CODES.passwordContainsUserName],
  ])('RF-1103 refuses a new password %s with 400 and the field', async (_rule, candidate, code) => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);

    const response = await change(browser, {
      currentPassword: amy.password,
      newPassword: candidate,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code, problems: [{ field: 'newPassword', code }] });
  });

  it('RF-1103 refuses a wrong current password with 400 RST-2211', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);

    const response = await change(browser, {
      currentPassword: fixturePassword('Wrong'),
      newPassword,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: ERROR_CODES.currentPasswordIncorrect,
      problems: [{ field: 'currentPassword' }],
    });
  });

  it.each([
    ['a password over 1,024 characters', { newPassword: 'x'.repeat(1025) }, 400],
    ['an unknown field', { other: 'value' }, 400],
    ['a body over 4 KiB', { newPassword: 'x'.repeat(5000) }, 413],
  ])('RF-1103 refuses %s', async (_case, extra, status) => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);

    const response = await change(browser, {
      currentPassword: amy.password,
      newPassword,
      ...extra,
    });

    expect(response.statusCode).toBe(status);
  });

  it('RF-1009 needs the CSRF token', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);

    const response = await browser.request({
      method: 'POST',
      url: '/api/account/password',
      payload: { currentPassword: amy.password, newPassword },
      csrf: false,
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.csrfTokenInvalid });
  });

  it('RF-1109 no response, audit row or log entry holds either password', async () => {
    const test = serve();
    const amy = await addUser(test, { userName: 'amy' });
    const browser = await signedInBrowser(test.server, amy);

    await change(browser, { currentPassword: fixturePassword('Wrong'), newPassword });
    await change(browser, { currentPassword: amy.password, newPassword });

    const trail = [
      ...browser.responses.map((response) => response.body),
      JSON.stringify(await test.audit.list({ since: 0 })),
      JSON.stringify(test.logger.entries),
    ].join('\n');
    expect(trail).not.toContain(newPassword);
    expect(trail).not.toContain(amy.password);
  });
});

describe('MustChangePassword', () => {
  async function forcedBrowser(
    test: TestServer,
  ): Promise<{ browser: TestBrowser; password: string }> {
    const mia = await addUser(test, {
      userName: 'mia',
      role: 'admin',
      state: 'MustChangePassword',
    });
    return { browser: await signedInBrowser(test.server, mia), password: mia.password };
  }

  it('RF-1102 an API route answers 403 RST-2212 and the refusal is audited', async () => {
    const test = serve();
    const { browser } = await forcedBrowser(test);

    const response = await browser.request({ method: 'GET', url: '/api/projects' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.passwordChangeRequired });
    const [refused] = await test.audit.list({ since: 0, action: 'request.refused' });
    expect(refused).toMatchObject({
      targetId: 'GET /api/projects',
      detail: { reason: 'password-change' },
    });
  });

  it('RF-1102 an administrator route answers 403 RST-2212 too', async () => {
    const test = serve();
    const { browser } = await forcedBrowser(test);

    const response = await browser.request({ method: 'GET', url: '/api/admin/users' });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: ERROR_CODES.passwordChangeRequired });
  });

  it('RF-1102 a page redirects to the change-password page, which opens', async () => {
    const test = serve();
    const { browser } = await forcedBrowser(test);

    const page = await browser.request({ method: 'GET', url: '/projects' });
    const form = await browser.request({ method: 'GET', url: '/account/password' });

    expect(page.statusCode).toBe(302);
    expect(page.headers.location).toBe('/account/password');
    expect(form.statusCode).toBe(200);
  });

  it('RF-1102 the session can be read and ended', async () => {
    const test = serve();
    const { browser } = await forcedBrowser(test);

    const read = await browser.request({ method: 'GET', url: '/api/session' });
    const ended = await browser.request({ method: 'DELETE', url: '/api/session' });

    expect(read.statusCode).toBe(200);
    expect(read.json()).toMatchObject({ user: { state: 'MustChangePassword' } });
    expect(ended.statusCode).toBe(204);
  });

  it('RF-1102 after the change every route opens again', async () => {
    const test = serve();
    const { browser, password } = await forcedBrowser(test);

    const changed = await change(browser, { currentPassword: password, newPassword });
    const projects = await browser.request({ method: 'GET', url: '/api/projects' });
    const page = await browser.request({ method: 'GET', url: '/projects' });

    expect(changed.statusCode).toBe(200);
    expect(projects.statusCode).toBe(200);
    expect(page.statusCode).toBe(200);
  });
});

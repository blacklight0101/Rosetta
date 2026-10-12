import type { Browser, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { accountRow, createAccount } from './support/admin-page.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { clientAddressFor } from './support/client-address.js';
import { accountFor, seededUser, type Credentials } from './support/seed.js';
import { e2eOrigin } from './support/server-config.js';
import { signInAs } from './support/sign-in.js';
import { signInThroughPage } from './support/sign-in-page.js';
import { fixturePassword } from '../support/account-fixtures.js';

// RF-1102, RF-1105, RF-1106, P1-42: the users and caps page. The administrator sees every account
// with role, state, last sign-in, projects and month-to-date cost, creates an account that must
// change its password, disables one so that its session ends at once, opens a workspace, and saves
// the caps on the server keys. A user who reaches /admin/* gets 403 from the API and the not
// found page. Every project (viewport and scheme) has its own administrator and its own new
// accounts; the specs run in order because they share them. Passwords are built at run time.

test.describe.configure({ mode: 'serial' });

const created = (project: string, kind: string): Credentials => ({
  userName: `e2e-new-${kind}-${project}`,
  password: fixturePassword(`New${kind}`),
});

/**
 * A page of a second browser context signed in as `who`. The session cookie is `Secure`, which only
 * a browser page sends to the plain-http test server (the context's request object does not).
 */
async function sessionPageOf(browser: Browser, who: Credentials): Promise<Page> {
  const context = await browser.newContext({ baseURL: e2eOrigin() });
  const answer = await context.request.post('/api/session', {
    data: { userName: who.userName, password: who.password },
    headers: { origin: e2eOrigin(), 'x-forwarded-for': clientAddressFor(who.userName) },
  });
  expect(answer.ok()).toBe(true);
  const page = await context.newPage();
  await page.goto('/healthz');
  return page;
}

/** The status `GET /api/session` answers to the page's cookies. */
function sessionStatus(page: Page): Promise<number> {
  return page.evaluate(async () => (await fetch('/api/session')).status);
}

/** Signs in as another account in this browser, which still holds the administrator cookies. */
async function signInAsOther(page: Page, who: Credentials): Promise<void> {
  await page.context().clearCookies();
  await signInThroughPage(page, who);
}

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('admin', info.project.name));
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Users and caps', level: 1 })).toBeVisible();
});

test('RF-1102 lists every account with role, state, last sign-in, projects and cost', async ({
  page,
}, info) => {
  const own = accountFor('admin', info.project.name);

  const row = accountRow(page, own.userName);

  await expect(row).toContainText('admin');
  await expect(row).toContainText('Active');
  await expect(row).not.toContainText('never');
  await expect(row).toContainText('$0.00');
  await expect(row.getByRole('button', { name: /^Disable/u })).toHaveCount(0);
  await expect(page.getByRole('columnheader', { name: 'Last sign-in (UTC)' })).toBeVisible();
  await expect(accountRow(page, seededUser.userName)).toContainText('Active');
  await expectNoSeriousViolations(page);
});

test('RF-1102 creates an account that must change its password at first sign-in', async ({
  page,
}, info) => {
  const account = created(info.project.name, 'force');

  await createAccount(page, { ...account, mustChange: true });

  await expect(page.getByRole('status').filter({ hasText: 'Created account' })).toBeVisible();
  await expect(accountRow(page, account.userName)).toContainText('Must change password');
  await expect(accountRow(page, account.userName)).toContainText('never');
  await page.reload();
  await expect(accountRow(page, account.userName)).toContainText('Must change password');
  await signInAsOther(page, account);
  await expect(page).toHaveURL(/\/account\/password$/u);
});

test('RF-1102 refuses a password that is too short next to its field', async ({ page }, info) => {
  const account = created(info.project.name, 'short');

  await createAccount(page, { ...account, password: 'short', mustChange: true });

  const form = page.getByRole('region', { name: 'Create an account' });
  await expect(form.getByLabel('Initial password')).toHaveAttribute('aria-invalid', 'true');
  await expect(form.getByTestId('field-error').filter({ hasText: 'RST-' })).toBeVisible();
  await expect(accountRow(page, account.userName)).toHaveCount(0);
});

test('RF-1102 disabling an account ends its session at once, enabling lets it back in', async ({
  page,
  browser,
}, info) => {
  const account = created(info.project.name, 'live');
  await createAccount(page, { ...account, mustChange: false });
  await expect(accountRow(page, account.userName)).toContainText('Active');
  const session = await sessionPageOf(browser, account);
  expect(await sessionStatus(session)).toBe(200);

  await accountRow(page, account.userName)
    .getByRole('button', { name: /^Disable/u })
    .click();

  await expect(accountRow(page, account.userName)).toContainText('Disabled');
  expect(await sessionStatus(session)).toBe(401);
  await accountRow(page, account.userName)
    .getByRole('button', { name: /^Enable/u })
    .click();
  await expect(accountRow(page, account.userName)).toContainText('Active');
  await session.context().close();
});

test('RF-1102 resets a password and the account must choose another', async ({ page }, info) => {
  const account = created(info.project.name, 'live');
  const replacement = fixturePassword('Reset');

  await accountRow(page, account.userName)
    .getByRole('button', { name: /^Reset password/u })
    .click();
  const panel = page.getByRole('region', { name: `Reset password for ${account.userName}` });
  await panel.getByLabel('New password').fill(replacement);
  await panel.getByRole('button', { name: 'Reset password' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Password reset' })).toBeVisible();
  await expect(accountRow(page, account.userName)).toContainText('Must change password');
  await signInAsOther(page, { ...account, password: replacement });
  await expect(page).toHaveURL(/\/account\/password$/u);
});

test('RF-1105 opens the workspace of an account, read only', async ({ page }, info) => {
  const account = created(info.project.name, 'live');

  await accountRow(page, account.userName)
    .getByRole('button', { name: /^Open workspace/u })
    .click();

  const panel = page.getByRole('region', { name: `Workspace of ${account.userName}` });
  await expect(panel).toContainText('no projects');
  await expectNoSeriousViolations(page);
});

test('RF-1106 saves the caps and shows them again after a reload', async ({ page }) => {
  const caps = page.getByRole('region', { name: 'Caps on server keys' });
  await caps.getByLabel('Per run (USD)').fill('0.5');
  await caps.getByLabel('Per user per day (USD)').fill('1');
  await caps.getByLabel('Server per month (USD)').fill('10');

  await caps.getByRole('button', { name: 'Save caps' }).click();

  await expect(page.getByRole('status').filter({ hasText: 'Caps saved' })).toBeVisible();
  await page.reload();
  await expect(caps.getByLabel('Per run (USD)')).toHaveValue('0.50');
  await expect(caps.getByLabel('Server per month (USD)')).toHaveValue('10.00');
  await expect(caps.getByRole('meter', { name: 'Server spend this month' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('RF-1106 refuses a cap that is not dollars next to its field', async ({ page }) => {
  const caps = page.getByRole('region', { name: 'Caps on server keys' });
  await caps.getByLabel('Per run (USD)').fill('a lot');

  await caps.getByRole('button', { name: 'Save caps' }).click();

  await expect(caps.getByLabel('Per run (USD)')).toHaveAttribute('aria-invalid', 'true');
});

test('RF-1105 a user gets 403 from the administration API and no administration page', async ({
  context,
  page,
}) => {
  await context.clearCookies();
  await signInAs(context, seededUser);

  await page.goto('/admin/users');

  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Users and caps' })).toHaveCount(0);
  const statuses = await page.evaluate(async () =>
    Promise.all(
      ['/api/admin/users', '/api/admin/audit', '/api/admin/caps', '/api/admin/default-roles'].map(
        async (path) => (await fetch(path)).status,
      ),
    ),
  );
  expect(statuses).toEqual([403, 403, 403, 403]);
});

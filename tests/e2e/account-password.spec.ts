import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInThroughPage, submitSignIn } from './support/sign-in-page.js';

// RF-1102, RF-1103, RNF-010, P1-14: the change-password page. An account created with "must change"
// (like the bootstrap administrator) is sent here at sign-in and reaches nothing else until it has
// chosen a password; the rule checklist follows the typing; the server's refusals show next to
// their field. Passwords are built from pieces at run time (RNF-003).

const goodPassword = ['a', 'brand', 'new', 'phrase', '2027'].join('-');
const commonPassword = ['unbe', 'lievable'].join('');

const rule = (page: Page, name: RegExp) =>
  page
    .getByRole('list', { name: 'Password rules' })
    .getByRole('listitem')
    .filter({ hasText: name });

async function sessionBody(page: Page): Promise<unknown> {
  return page.evaluate(async () => {
    const answer = await fetch('/api/session');
    const body: unknown = await answer.json();
    return body;
  });
}

async function fillPasswords(page: Page, current: string, next: string, repeat = next) {
  await page.getByLabel(/^(Temporary|Current) password$/u).fill(current);
  await page.getByLabel('New password').fill(next);
  await page.getByLabel('Repeat the new password').fill(repeat);
}

test.describe.configure({ mode: 'serial' });

test.describe('forced change at the first sign-in', () => {
  test('RF-1102 sign-in leads to the change-password page and every other page too', async ({
    page,
  }, info) => {
    await signInThroughPage(page, accountFor('force', info.project.name));

    await expect(page).toHaveURL(/\/account\/password$/u);
    await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible();
    await expect(page.getByLabel('Temporary password')).toBeVisible();
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/account\/password$/u);
    const keys = await page.evaluate(async () => (await fetch('/api/account/keys')).status);
    expect(keys).toBe(403);
  });

  test('RF-1103 shows the rules before typing and updates them while typing', async ({
    page,
  }, info) => {
    const account = accountFor('force', info.project.name);
    await signInThroughPage(page, account);
    await expect(page).toHaveURL(/\/account\/password$/u);
    const items = page.getByRole('list', { name: 'Password rules' }).getByRole('listitem');
    await expect(items).toHaveCount(3);
    for (const item of await items.all()) {
      await expect(item).toHaveAttribute('data-state', 'pending');
    }

    await page.getByLabel('New password').fill('too-short');
    await expect(rule(page, /At least 12 characters \(9 so far\)/u)).toHaveAttribute(
      'data-state',
      'fail',
    );

    await page.getByLabel('New password').fill(goodPassword);
    await expect(rule(page, /At least 12 characters/u)).toHaveAttribute('data-state', 'pass');
    await expect(rule(page, /user name/u)).toHaveAttribute('data-state', 'pass');

    await page.getByLabel('New password').fill(`${account.userName}-and-more`);
    await expect(rule(page, /user name/u)).toHaveAttribute('data-state', 'fail');
    await expectNoSeriousViolations(page);
  });

  test('RF-1103 the server judges the common-password list and a wrong temporary password', async ({
    page,
  }, info) => {
    const account = accountFor('force', info.project.name);
    await signInThroughPage(page, account);
    await expect(page).toHaveURL(/\/account\/password$/u);

    await fillPasswords(page, account.password, commonPassword);
    await page.getByRole('button', { name: 'Save and continue' }).click();

    await expect(page.getByText(/RST-2203/u)).toBeVisible();
    await expect(rule(page, /common passwords/u)).toHaveAttribute('data-state', 'fail');

    await fillPasswords(page, 'not-the-temporary-password', goodPassword);
    await page.getByRole('button', { name: 'Save and continue' }).click();

    await expect(page.getByText(/RST-2211/u)).toBeVisible();
    await expect(page.getByLabel('Temporary password')).toHaveAttribute('aria-invalid', 'true');
    await expect(page).toHaveURL(/\/account\/password$/u);
  });

  test('RF-1103 does not send a new password that is repeated differently', async ({
    page,
  }, info) => {
    const account = accountFor('force', info.project.name);
    await signInThroughPage(page, account);

    await fillPasswords(page, account.password, goodPassword, `${goodPassword}x`);
    await page.getByRole('button', { name: 'Save and continue' }).click();

    await expect(page.getByText('The two passwords do not match.')).toBeVisible();
    await expect(page).toHaveURL(/\/account\/password$/u);
  });

  test('RF-1102 and RF-1103 after the change the account reaches the projects and the new password signs in', async ({
    page,
  }, info) => {
    const account = accountFor('force', info.project.name);
    await signInThroughPage(page, account);

    await fillPasswords(page, account.password, goodPassword);
    await page.getByRole('button', { name: 'Save and continue' }).click();

    await expect(page).toHaveURL(/\/projects$/u);
    expect(await sessionBody(page)).toMatchObject({
      user: { userName: account.userName, state: 'Active' },
    });
    const settings = await page.goto('/settings');
    expect(settings?.status()).toBe(200);
    await expect(page).toHaveURL(/\/settings$/u);

    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/sign-in$/u);
    await submitSignIn(page, { userName: account.userName, password: goodPassword });
    await expect(page).toHaveURL(/\/projects$/u);
  });
});

test.describe('forced change of an administrator', () => {
  test('RF-1102 the administrator who changes the temporary password reaches the projects', async ({
    page,
  }, info) => {
    const account = accountFor('force-admin', info.project.name);
    await signInThroughPage(page, account);
    await expect(page).toHaveURL(/\/account\/password$/u);

    await fillPasswords(page, account.password, goodPassword);
    await page.getByRole('button', { name: 'Save and continue' }).click();

    await expect(page).toHaveURL(/\/projects$/u);
    expect(await sessionBody(page)).toMatchObject({ user: { role: 'admin', state: 'Active' } });
  });
});

test.describe('change from the settings', () => {
  test('RF-1103 an active user opens the page from the settings, passes axe and cannot reuse the password', async ({
    page,
  }, info) => {
    const account = accountFor('keys', info.project.name);
    await signInThroughPage(page, account);
    await expect(page).toHaveURL(/\/projects$/u);

    await page.goto('/settings');
    await page.getByRole('link', { name: 'Change password' }).click();

    await expect(page).toHaveURL(/\/account\/password$/u);
    await expect(page.getByRole('heading', { name: 'Change your password' })).toBeVisible();
    await expect(page.getByLabel('Current password')).toBeVisible();
    await expectNoSeriousViolations(page);

    await fillPasswords(page, account.password, account.password);
    await page.getByRole('button', { name: 'Change password' }).click();

    await expect(page.getByText(/RST-2214/u)).toBeVisible();
    await expect(page.getByLabel('New password')).toHaveAttribute('aria-invalid', 'true');
  });
});

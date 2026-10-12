import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor, seededAdmin } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { signInThroughPage, submitSignIn } from './support/sign-in-page.js';

// RF-1100, RF-1101, RNF-010, P1-14: the sign-in page. A wrong password and a locked account get
// the same message, a good sign-in lands on the projects, Sign out in the header ends the session,
// and the page passes axe in the project's colour scheme. Each test browses from an address of its
// own (fixtures.ts), so the sign-in rate limit counts that test only.

const genericMessage = 'User name or password is incorrect.';

test.describe('sign-in page', () => {
  test('RF-1100 shows the form and the invite-only note, and passes axe', async ({ page }) => {
    await page.goto('/sign-in');

    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
    await expect(page.getByLabel('User name')).toBeVisible();
    await expect(page.getByText(/invite-only/u)).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expectNoSeriousViolations(page);
  });

  test('RF-1100 a wrong password shows only the generic message and clears the password', async ({
    page,
  }, info) => {
    const account = accountFor('keys', info.project.name);
    await page.goto('/sign-in');

    await submitSignIn(page, { ...account, password: 'not-the-password-at-all' });

    const banner = page.getByRole('alert');
    await expect(banner).toContainText(genericMessage);
    await expect(banner).toContainText('RST-2201');
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue('');
    await expect(page).toHaveURL(/\/sign-in$/u);
    await expectNoSeriousViolations(page);
  });

  test('RF-1100 an unknown user gets the same message as a wrong password', async ({
    page,
  }, info) => {
    const account = accountFor('keys', info.project.name);
    await page.goto('/sign-in');
    await submitSignIn(page, { ...account, password: 'not-the-password-at-all' });
    const wrong = await page.getByRole('alert').innerText();

    await submitSignIn(page, { userName: 'nobody.here', password: 'not-the-password-at-all' });

    await expect(page.getByRole('alert')).toHaveText(wrong);
  });

  test('RF-1100 after five failed attempts a locked account shows the same message', async ({
    page,
  }, info) => {
    const account = accountFor('lock', info.project.name);
    await page.goto('/sign-in');
    await submitSignIn(page, { ...account, password: 'not-the-password-at-all' });
    const wrong = await page.getByRole('alert').innerText();
    for (let attempt = 2; attempt <= 5; attempt += 1) {
      await submitSignIn(page, {
        ...account,
        password: `still-not-the-password-${String(attempt)}`,
      });
      await expect(page.getByRole('alert')).toHaveText(wrong);
    }

    // The sixth attempt carries the right password, but the account is locked.
    await submitSignIn(page, account);

    await expect(page.getByRole('alert')).toHaveText(wrong);
    await expect(page.getByRole('alert')).toContainText(genericMessage);
    await expect(page).toHaveURL(/\/sign-in$/u);
  });

  test('RF-1100 and RF-1101 a good sign-in lands on the projects and Sign out ends the session', async ({
    page,
  }, info) => {
    await signInThroughPage(page, accountFor('keys', info.project.name));

    await expect(page).toHaveURL(/\/projects$/u);
    await page.getByRole('button', { name: 'Sign out' }).click();

    await expect(page).toHaveURL(/\/sign-in$/u);
    const session = await page.evaluate(async () => (await fetch('/api/session')).status);
    expect(session).toBe(401);
    await page.goto('/projects');
    await expect(page).toHaveURL(/\/sign-in$/u);
  });

  test('RF-1100 a signed-in browser that opens the settings sees them and Sign out in the header', async ({
    context,
    page,
  }, info) => {
    await signInAs(context, accountFor('keys', info.project.name));

    await page.goto('/settings');

    await expect(page.getByRole('heading', { name: 'Settings and keys', level: 1 })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  });

  test('RF-1102 the bootstrap administrator is sent to the change-password page', async ({
    page,
  }) => {
    await signInThroughPage(page, seededAdmin);

    await expect(page).toHaveURL(/\/account\/password$/u);
  });
});

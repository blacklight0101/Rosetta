import { expect, test } from '../support/fixtures.js';
import { accountFor } from '../support/seed.js';
import { signInAs } from '../support/sign-in.js';
import { expectPageInView } from '../support/sweep.js';

// RNF-010, RF-1102, RF-1103, RF-1104, RF-1105, architecture.md section 17: the visual sweep of the
// pages of an account, in all four projects (@visual): the first sign-in that must choose a
// password, the settings and keys, the change-password page, the error of a run that is not the
// account's own, the error of each page of a project that is not its own (two-users.spec.ts) and the
// page-not-found page. Each page follows the colour scheme, passes axe and never scrolls sideways.

test.describe('visual sweep: first sign-in', { tag: '@visual' }, () => {
  test('RNF-010 the choose-password page of an account that must change its password', async ({
    context,
    page,
  }, info) => {
    await signInAs(context, accountFor('sweep-force', info.project.name));

    await page.goto('/projects');
    await expect(page).toHaveURL(/\/account\/password$/u);
    await expect(page.getByRole('heading', { name: 'Choose your password' })).toBeVisible();

    await expectPageInView(page);
  });
});

test.describe('visual sweep: account pages', { tag: '@visual' }, () => {
  test.beforeEach(async ({ context }, info) => {
    await signInAs(context, accountFor('sweep', info.project.name));
  });

  test('RNF-010 the settings page with the keys, the cap and the provider test', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings and keys', level: 1 })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Test providers' })).toBeVisible();

    await expectPageInView(page);
  });

  test('RNF-010 the change-password page of an active account', async ({ page }) => {
    await page.goto('/account/password');
    await expect(page.getByRole('heading', { name: 'Change your password' })).toBeVisible();

    await expectPageInView(page);
  });

  test('RNF-010 the error of a run that is not the account own', async ({ page }) => {
    await page.goto('/runs/00000000-0000-4000-8000-000000000000');
    await expect(page.getByTestId('error-banner')).toContainText('RST-2003');

    await expectPageInView(page);
  });

  test('RNF-010 the error of each page of a project that is not the account own', async ({
    page,
  }) => {
    for (const section of ['start', 'cost', 'history', 'settings']) {
      await page.goto(`/projects/00000000-0000-4000-8000-000000000000/${section}`);
      await expect(page.getByTestId('error-banner')).toContainText('RST-2003');

      await expectPageInView(page);
    }
  });

  test('RNF-010 the page-not-found page', async ({ page }) => {
    await page.goto('/admin/users');
    await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();

    await expectPageInView(page);
  });
});

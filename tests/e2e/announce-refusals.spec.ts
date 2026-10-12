import { expect, test } from './support/fixtures.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { submitSignIn } from './support/sign-in-page.js';

// RNF-010, design-system.md section 8, P1-14: a refused submit is announced and focus goes to what
// needs fixing. The checks read the focused element and the aria wiring a screen reader uses.

test('RNF-010 a wrong current password focuses that field and announces its error', async ({
  context,
  page,
}, info) => {
  await signInAs(context, accountFor('keys', info.project.name));
  await page.goto('/account/password');
  const current = page.getByLabel('Current password');
  await current.fill('not-the-current-password');
  await page.getByLabel('New password', { exact: true }).fill('a-perfectly-fine-phrase-2027');
  await page.getByLabel('Repeat the new password').fill('a-perfectly-fine-phrase-2027');

  await page.getByRole('button', { name: 'Change password' }).click();

  await expect(current).toBeFocused();
  await expect(current).toHaveAttribute('aria-invalid', 'true');
  const described = await current.getAttribute('aria-describedby');
  expect(described).toContain('change-password-current-error');
  await expect(page.locator('#change-password-current-error')).toHaveAttribute('role', 'alert');
  await expect(page.locator('#change-password-current-error')).toContainText('RST-2211');
});

test('RNF-010 a failed sign-in focuses the password field and the banner ends with the code', async ({
  page,
}, info) => {
  const account = accountFor('keys', info.project.name);
  await page.goto('/sign-in');

  await submitSignIn(page, { ...account, password: 'not-the-password-at-all' });

  await expect(page.getByLabel('Password', { exact: true })).toBeFocused();
  await expect(page.getByRole('alert')).toContainText(/incorrect.*\(RST-2201\)/su);
});

test('RNF-010 a refused base URL focuses the URL field and announces its error', async ({
  context,
  page,
}, info) => {
  await signInAs(context, accountFor('keys', info.project.name));
  await page.goto('/settings');
  const row = page
    .getByTestId('key-row')
    .filter({ has: page.getByRole('heading', { name: 'OpenAI-compatible', level: 3 }) });
  const url = row.getByLabel('Base URL');
  await url.fill('https://192.168.1.20:8000/v1');
  await row.getByLabel('API key').fill(['fixture', 'refused', 'key', 'material', 'ZZ99'].join('-'));

  await row.getByRole('button', { name: 'Save key' }).click();

  await expect(url).toBeFocused();
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  await expect(row.getByRole('alert')).toContainText('RST-2304');
});

import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { expectNoFullKey, fixtureKeyEndingIn } from './support/no-full-key.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-1104, RF-1105, DEC-107, RNF-010, P1-14: the settings page. Keys are saved, replaced and
// deleted with confirmation, shown only by their last four characters, and the full value is in no
// part of the page after any step. The account belongs to the project (seed.ts), and the steps run
// in order because they share its keys. The fixture keys are built from pieces at run time.

const firstKey = fixtureKeyEndingIn('first', 'AB12');
const secondKey = fixtureKeyEndingIn('second', 'CD34');
const anthropicKey = fixtureKeyEndingIn('third', 'EF56');
const compatibleKey = fixtureKeyEndingIn('fourth', 'GH78');
const allKeys = [firstKey, secondKey, anthropicKey, compatibleKey];

const rowOf = (page: Page, name: string): Locator =>
  page
    .getByTestId('key-row')
    .filter({ has: page.getByRole('heading', { name, level: 3, exact: true }) });

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('keys', info.project.name));
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Provider keys' })).toBeVisible();
});

test('RF-1104 starts with no key, offers every provider and passes axe', async ({ page }) => {
  for (const name of ['OpenAI', 'Anthropic', 'OpenAI-compatible']) {
    await expect(rowOf(page, name).getByRole('button', { name: 'Save key' })).toBeVisible();
  }
  await expect(page.getByTestId('own-daily-cap')).toContainText('not available yet');
  await expect(page.getByRole('link', { name: 'Change password' })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('RF-1104 refuses a key that is too short next to its field', async ({ page }) => {
  const row = rowOf(page, 'OpenAI');
  await row.getByLabel('API key').fill('short');

  await row.getByRole('button', { name: 'Save key' }).click();

  await expect(row.getByText(/RST-2301/u)).toBeVisible();
  await expect(row.getByLabel('API key')).toHaveAttribute('aria-invalid', 'true');
});

test('RF-1104 saves a key and shows only its last four characters', async ({ page }) => {
  const row = rowOf(page, 'OpenAI');
  await row.getByLabel('API key').fill(firstKey);

  await row.getByRole('button', { name: 'Save key' }).click();

  await expect(row).toContainText('AB12');
  await expect(row.getByRole('button', { name: 'Replace' })).toBeVisible();
  await expect(row.getByLabel('API key')).toHaveCount(0);
  await expectNoFullKey(page, allKeys);

  await page.reload();
  await expect(rowOf(page, 'OpenAI')).toContainText('AB12');
  await expectNoFullKey(page, allKeys);
  await expectNoSeriousViolations(page);
});

test('RF-1104 replaces the key only after the person confirms, and cancel keeps it', async ({
  page,
}) => {
  const row = rowOf(page, 'OpenAI');
  await row.getByRole('button', { name: 'Replace' }).click();
  await expect(row).toContainText('The saved key ending AB12 is removed');
  await row.getByRole('button', { name: 'Cancel' }).click();
  await expect(row).toContainText('AB12');

  await row.getByRole('button', { name: 'Replace' }).click();
  await row.getByLabel('API key').fill(secondKey);
  await row.getByRole('button', { name: 'Replace key' }).click();

  await expect(row).toContainText('CD34');
  await expect(row).not.toContainText('AB12');
  await expectNoFullKey(page, allKeys);
  await page.reload();
  await expect(rowOf(page, 'OpenAI')).toContainText('CD34');
  await expectNoFullKey(page, allKeys);
});

test('RF-1104 saves a key for another provider without touching the first', async ({ page }) => {
  const row = rowOf(page, 'Anthropic');
  await row.getByLabel('API key').fill(anthropicKey);

  await row.getByRole('button', { name: 'Save key' }).click();

  await expect(row).toContainText('EF56');
  await expect(rowOf(page, 'OpenAI')).toContainText('CD34');
  await expectNoFullKey(page, allKeys);
});

test('RF-1104 refuses an OpenAI-compatible base URL that is not public https', async ({ page }) => {
  const row = rowOf(page, 'OpenAI-compatible');
  await row.getByLabel('Base URL').fill('https://192.168.1.20:8000/v1');
  await row.getByLabel('API key').fill(compatibleKey);

  await row.getByRole('button', { name: 'Save key' }).click();

  await expect(row.getByText(/RST-2304/u)).toBeVisible();
  await expect(row.getByLabel('Base URL')).toHaveAttribute('aria-invalid', 'true');
  await expectNoFullKey(page, allKeys, [compatibleKey]);
});

test('RF-1104 saves an OpenAI-compatible key with a public https base URL', async ({ page }) => {
  const row = rowOf(page, 'OpenAI-compatible');
  await row.getByLabel('Base URL').fill('https://8.8.8.8/v1');
  await row.getByLabel('API key').fill(compatibleKey);

  await row.getByRole('button', { name: 'Save key' }).click();

  await expect(row).toContainText('GH78');
  await expectNoFullKey(page, allKeys);
});

test('RF-1104 deletes a key only after the person confirms, and the key is gone after a reload', async ({
  page,
}) => {
  const row = rowOf(page, 'OpenAI');
  await row.getByRole('button', { name: 'Delete' }).click();
  await expect(row).toContainText('Delete the key ending CD34?');
  await row.getByRole('button', { name: 'Cancel' }).click();
  await expect(row).toContainText('CD34');

  await row.getByRole('button', { name: 'Delete' }).click();
  await row.getByRole('button', { name: 'Delete key' }).click();

  await expect(row.getByRole('button', { name: 'Save key' })).toBeVisible();
  await expect(row).not.toContainText('CD34');
  await page.reload();
  await expect(rowOf(page, 'OpenAI').getByRole('button', { name: 'Save key' })).toBeVisible();
  await expect(rowOf(page, 'Anthropic')).toContainText('EF56');
  await expectNoFullKey(page, allKeys);
});

test('RF-1104 deleting the remaining keys leaves the page with none', async ({ page }) => {
  for (const name of ['Anthropic', 'OpenAI-compatible']) {
    const row = rowOf(page, name);
    await row.getByRole('button', { name: 'Delete' }).click();
    await row.getByRole('button', { name: 'Delete key' }).click();
    await expect(row.getByRole('button', { name: 'Save key' })).toBeVisible();
  }
  await expectNoFullKey(page, allKeys);
});

import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// DEC-107, RF-1106, P1-27: the optional daily cap on the user's own keys, on the settings page. It
// starts empty (no cap), is saved in dollars, survives a reload, refuses an amount that is not
// dollars next to its field, and is removed by saving an empty field. The account belongs to the
// project (seed.ts), and the steps run in order because they share its cap.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('cap', info.project.name));
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Spending cap' })).toBeVisible();
});

test('RF-1106 starts with no cap on the own keys and passes axe', async ({ page }) => {
  const slot = page.getByTestId('own-daily-cap');

  await expect(slot.getByLabel('Daily cap for my own keys')).toHaveValue('');
  await expect(slot.getByLabel('Daily cap for my own keys')).toBeEnabled();
  await expectNoSeriousViolations(page);
});

test('RF-1106 refuses an amount that is not dollars next to its field', async ({ page }) => {
  const slot = page.getByTestId('own-daily-cap');
  await slot.getByLabel('Daily cap for my own keys').fill('ten dollars');

  await slot.getByRole('button', { name: 'Save cap' }).click();

  await expect(slot.getByLabel('Daily cap for my own keys')).toHaveAttribute(
    'aria-invalid',
    'true',
  );
});

test('RF-1106 saves a daily cap and shows it again after a reload', async ({ page }) => {
  const slot = page.getByTestId('own-daily-cap');
  await slot.getByLabel('Daily cap for my own keys').fill('2.5');

  await slot.getByRole('button', { name: 'Save cap' }).click();

  await expect(slot).toContainText(
    'Saved: runs on your own keys stop before they pass $2.50 in a UTC day.',
  );
  await page.reload();
  await expect(
    page.getByTestId('own-daily-cap').getByLabel('Daily cap for my own keys'),
  ).toHaveValue('2.50');
  await expectNoSeriousViolations(page);
});

test('RF-1106 removes the cap when the field is saved empty', async ({ page }) => {
  const field = page.getByTestId('own-daily-cap').getByLabel('Daily cap for my own keys');
  await expect(field).toHaveValue('2.50');
  await field.fill('');

  await page.getByTestId('own-daily-cap').getByRole('button', { name: 'Save cap' }).click();

  await expect(page.getByTestId('own-daily-cap')).toContainText(
    'Saved: no daily cap on your own keys.',
  );
  await page.reload();
  await expect(
    page.getByTestId('own-daily-cap').getByLabel('Daily cap for my own keys'),
  ).toHaveValue('');
});

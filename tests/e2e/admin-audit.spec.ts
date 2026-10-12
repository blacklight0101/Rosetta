import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-1109, P1-42: the audit page lists the last 30 days newest first and filters them by user and
// action. The administrator's own sign-in (made by the fixture) is a row of that user.

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('admin', info.project.name));
  await page.goto('/admin/audit');
  await expect(page.getByRole('heading', { name: 'Audit', level: 1 })).toBeVisible();
});

test('RF-1109 lists the recent events and passes axe', async ({ page }) => {
  const table = page.getByRole('table', { name: 'Audit events' });

  await expect(table.getByRole('row')).not.toHaveCount(1);
  await expect(table).toContainText('auth.sign_in');
  await expect(page.getByText('newest first')).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('RF-1109 filters the events by user and by action', async ({ page }, info) => {
  const own = accountFor('admin', info.project.name).userName;
  const table = page.getByRole('table', { name: 'Audit events' });

  await page.getByLabel('User').selectOption({ label: own });
  await page.getByLabel('Action').selectOption('auth.sign_in');

  await expect(page.getByText(/^Showing \d+ events?/u)).toBeVisible();
  const rows = table.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows.first()).toBeVisible();
  for (const row of await rows.all()) {
    await expect(row.getByRole('cell').nth(1)).toHaveText(own);
    await expect(row.getByRole('cell').nth(2)).toHaveText('auth.sign_in');
  }
  await page.getByLabel('Action').selectOption('key.deleted');
  await expect(page.getByText('No events match these filters')).toBeVisible();
  await page.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.getByLabel('User')).toHaveValue('');
  await expect(table.getByRole('row')).not.toHaveCount(1);
});

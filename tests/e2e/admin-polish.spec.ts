import { expect, test } from './support/fixtures.js';
import { accountRow } from './support/admin-page.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor, seededUser } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';

// RF-1102, RF-1104, RF-1105, RF-1109, P1-107 (AdminUsers.dc.html, AdminAudit.dc.html): the row
// actions of an account sit on one line, the accounts filter by name and say whether each may use
// the server's keys, the audit view narrows by period and outcome, and an /admin/* page asked for
// by a user answers the application shell (200) with the not-found page and no administration data.

test('RF-1102 the row actions sit on one line; the name filter narrows the accounts', async ({
  context,
  page,
}, info) => {
  await signInAs(context, accountFor('admin', info.project.name));
  await page.goto('/admin/users');
  const row = accountRow(page, seededUser.userName);
  const buttons = row.getByRole('button');
  await expect(buttons).toHaveCount(3);

  const tops = await Promise.all(
    (await buttons.all()).map(async (button) => (await button.boundingBox())?.y ?? -1),
  );
  expect(new Set(tops).size).toBe(1);
  await page.getByLabel('Filter by name').fill(seededUser.userName);

  const table = page.getByRole('table', { name: 'Accounts' });
  await expect(table.getByRole('row')).toHaveCount(2);
  await expect(page.getByRole('columnheader', { name: 'Server keys' })).toBeVisible();
  await expect(row).toContainText('allowed');
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-1109 the audit page narrows the events by period and outcome', async ({
  context,
  page,
}, info) => {
  await signInAs(context, accountFor('admin', info.project.name));
  await page.goto('/admin/audit');
  const table = page.getByRole('table', { name: 'Audit events' });
  await expect(table.getByRole('row')).not.toHaveCount(1);

  await page.getByLabel('Period').selectOption({ label: 'Last 24 hours' });
  await page.getByLabel('Outcome').selectOption('ok');

  await expect(page.getByText(/^Showing \d+ events?/u)).toBeVisible();
  const rows = table.getByRole('row').filter({ has: page.getByRole('cell') });
  await expect(rows.first()).toBeVisible();
  for (const each of await rows.all()) {
    await expect(each.getByRole('cell').nth(5)).toHaveText('ok');
  }
  await page.getByLabel('Outcome').selectOption('failed');
  await page.getByLabel('Action').selectOption('key.deleted');
  await expect(page.getByText('No events match these filters in the last 24 hours.')).toBeVisible();
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
});

test('RF-1105 an /admin/* page asked for by a user answers the shell with 200 and no data', async ({
  context,
  page,
}) => {
  await signInAs(context, seededUser);

  const response = await page.goto('/admin/audit');

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Page not found' })).toBeVisible();
  await expect(page.getByRole('navigation')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Audit' })).toHaveCount(0);
  await expect(page.getByRole('table')).toHaveCount(0);
});

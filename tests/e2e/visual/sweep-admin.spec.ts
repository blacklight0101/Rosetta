import { accountRow } from '../support/admin-page.js';
import { expect, test } from '../support/fixtures.js';
import { confirmation, plantSnapshot } from '../support/history-page.js';
import { accountFor, seededUser } from '../support/seed.js';
import { signInAs } from '../support/sign-in.js';
import { expectPageInView } from '../support/sweep.js';

// RNF-010, RF-1102, RF-1105, RF-1106, RF-1109, RF-1012, DEC-106, architecture.md section 17: the
// visual sweep of the administration pages, in all four projects (@visual): the projects page with
// the server's cap banner (seed-cost.ts spends 85% of the month), users and caps with a workspace
// open, the audit, the default models and the snapshots with the delete confirmation open. Each page
// follows the colour scheme, passes axe and never scrolls sideways.

/** Every test of the sweep runs in all four projects (playwright.config.ts). */
const visual = { tag: '@visual' };

/**
 * The table of this page is wider than 360 px (found by this sweep; RNF-010 asks 360 px of the
 * landing page, sign-in and report only), so at 360 px its overflow is recorded, not failed.
 */
const wideTable = { scrollsSidewaysUntil: 'a follow-up card fits its table into 360 px' };

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('sweep-admin', info.project.name));
});

test(
  'RNF-010 the projects page of an administrator with the cap banner',
  visual,
  async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('status').filter({ hasText: 'of its monthly cap' })).toBeVisible();

    await expectPageInView(page);
  },
);

test('RNF-010 users and caps, with the workspace of an account open', visual, async ({ page }) => {
  await page.goto('/admin/users');
  await expect(page.getByRole('heading', { name: 'Users and caps', level: 1 })).toBeVisible();
  await expectPageInView(page, 'app', wideTable);

  await accountRow(page, seededUser.userName)
    .getByRole('button', { name: /^Open workspace/u })
    .click();
  await expect(
    page.getByRole('region', { name: `Workspace of ${seededUser.userName}` }),
  ).toBeVisible();

  await expectPageInView(page, 'app', wideTable);
});

test('RNF-010 the audit page', visual, async ({ page }) => {
  await page.goto('/admin/audit');
  await expect(page.getByRole('table', { name: 'Audit events' })).toContainText('auth.sign_in');

  await expectPageInView(page);
});

test('RNF-010 the default models page', visual, async ({ page }) => {
  await page.goto('/admin/models');
  await expect(page.getByRole('heading', { name: 'Default models', level: 1 })).toBeVisible();

  await expectPageInView(page);
});

test('RNF-010 the snapshots page and its delete confirmation', visual, async ({ page }, info) => {
  const planted = await plantSnapshot(`sweep-${info.project.name}`);
  await page.goto('/admin/snapshots');
  const row = page.getByRole('row').filter({ hasText: planted.repository });
  await expect(row).toContainText('unused');
  await expectPageInView(page, 'app', wideTable);

  await row.getByRole('button', { name: /^Delete:/u }).click();
  await expect(confirmation(page)).toContainText('This cannot be undone.');

  await expectPageInView(page, 'app', wideTable);
  await page.keyboard.press('Escape');
  await expect(confirmation(page)).toHaveCount(0);
});

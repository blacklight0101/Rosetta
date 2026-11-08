import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { expectRowMenuWorks } from './support/row-menu.js';
import { signInAs } from './support/sign-in.js';

// RF-010, RF-1105, DEC-70, P1-41: the projects page. A user pastes a public GitHub URL (the test
// server's fake GitHub answers for octo/demo; creating a project only reads the address), sees the
// project in a list that is theirs alone, gets the refusal next to the field for an address that is
// not a GitHub repository, and is taken to the existing project when the same address is created
// again. The account belongs to the project (seed.ts), and the steps run in order because they
// share its projects.

const demoUrl = 'https://github.com/octo/demo';

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('projects', info.project.name));
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
});

test('RF-010 starts with no project, offers the demo repository and passes axe', async ({
  page,
}) => {
  await expect(page.getByText('No projects yet')).toBeVisible();
  await expect(page.getByRole('table')).toHaveCount(0);

  await page.getByRole('button', { name: 'Use the demo repository' }).click();

  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(/eShopModernizing/u);
  await expectNoSeriousViolations(page);
});

test('RF-010 refuses an address that is not a GitHub repository next to the field', async ({
  page,
}) => {
  const url = page.getByLabel('GitHub repository URL');
  await url.fill('https://example.com/octo/demo');

  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page.getByTestId('field-error').filter({ hasText: 'RST-1900' })).toBeVisible();
  await expect(url).toHaveAttribute('aria-invalid', 'true');
  await expect(url).toBeFocused();
  await expect(page.getByRole('table')).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test(
  'RF-010 creates a project from a GitHub URL and lists it',
  { tag: '@phone' },
  async ({ page }) => {
    await page.getByLabel('GitHub repository URL').fill(demoUrl);

    await page.getByRole('button', { name: 'Create project' }).click();

    // EV-87, P8-10: the new project opens its page by itself; the list shows it afterwards.
    await expect(page).toHaveURL(/\/projects\/[^/]+$/u);
    await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
    await page.goto('/projects');
    const row = page.getByRole('row').filter({ hasText: 'octo/demo' });
    await expect(row).toBeVisible();
    await expect(row).toContainText('default branch');
    await page.reload();
    await expect(page.getByRole('row').filter({ hasText: 'octo/demo' })).toHaveCount(1);
    await expectNoSeriousViolations(page);
    // The verdict on #268: with a project listed, the page scrolled sideways at 360 px (529).
    const overflow: unknown = await page.evaluate(
      'document.documentElement.scrollWidth - window.innerWidth',
    );
    expect(Number(overflow)).toBeLessThanOrEqual(0);
  },
);

test('RF-010 creating the same address again opens the existing project', async ({ page }) => {
  await page.getByLabel('GitHub repository URL').fill(demoUrl);

  await page.getByRole('button', { name: 'Create project' }).click();

  await expect(page).toHaveURL(/\/projects\/[^/]+$/u);
  await expect(page.getByRole('heading', { name: 'Start a run' })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(demoUrl);
  await page.goto('/projects');
  await expect(page.getByRole('row').filter({ hasText: 'octo/demo' })).toHaveCount(1);
});

/** RF-160: creates the demo project and waits on its page for the scan it starts by itself to end. */
async function createScannedProject(page: Page): Promise<void> {
  await page.getByLabel('GitHub repository URL').fill(demoUrl);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+$/u);
  // Leaving at once would start no scan or leave one running; the areas appear when it has ended.
  const areas = page.getByRole('group', { name: 'Areas from the code map' }).locator('label');
  await expect(areas.first()).toBeVisible({ timeout: 60_000 });
}

test('RF-010 RF-1012 a row has the name link, a source badge, Open and a menu whose Delete removes the project', async ({
  page,
}, info) => {
  await createScannedProject(page);
  await page.goto('/projects');
  const row = page.getByRole('row').filter({ hasText: 'octo/demo' });
  await expect(row.getByRole('link', { name: 'octo/demo', exact: true })).toBeVisible();
  await expect(row.locator('.rst-badge', { hasText: 'GitHub' })).toBeVisible();
  await expect(row.getByRole('link', { name: 'Open for octo/demo' })).toBeVisible();
  await expect(page.locator('.rst-table .rst-button--primary')).toHaveCount(0);
  await expect(page.getByRole('columnheader')).toHaveText([
    'Project',
    'Source',
    'Where it is',
    'Last run',
    'Cost',
    'Actions',
  ]);
  // Only a scan has ended, so the row says what the project page says; "Scan not started" is in the unit tests.
  await expect(row.getByRole('cell').nth(2)).toHaveText('Start a run');
  // P8-99 screenshots of the list at 1280 px and at 390 px, attached to the test report.
  for (const [name, width, height] of [
    ['projects-list-1280', 1280, 800],
    ['projects-list-390', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(row).toBeVisible();
    await info.attach(name, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
  }
  await page.setViewportSize({ width: 1280, height: 800 });

  const menuButton = page.getByRole('button', { name: 'More actions for octo/demo' });
  await expectRowMenuWorks(page, menuButton);
  await page.setViewportSize({ width: 360, height: 780 });
  await expectRowMenuWorks(page, menuButton);
  await page.setViewportSize({ width: 1280, height: 800 });
  await menuButton.click();
  await page.getByRole('menuitem', { name: 'Delete project…' }).click();
  await expect(page.getByRole('menu')).toHaveCount(0);
  const dialog = page.getByRole('dialog', { name: 'Delete project octo/demo?' });
  await expect(dialog).toContainText('cost ledger');
  await dialog.getByRole('button', { name: 'Delete project' }).click();

  await expect(page.getByText('No projects yet')).toBeVisible();
  await expectNoSeriousViolations(page);
});

test('RF-010 P8-134 the owner renames a project from the row menu and the list and the page show the new name', async ({
  page,
}) => {
  await createScannedProject(page);
  await page.goto('/projects');
  const menuButton = page.getByRole('button', { name: 'More actions for octo/demo' });
  await menuButton.click();
  await page.getByRole('menuitem', { name: 'Rename' }).click();
  const dialog = page.getByRole('dialog', { name: 'Rename project octo/demo' });
  const field = dialog.getByLabel('Project name');
  await expect(field).toHaveValue('octo/demo');
  await expectNoSeriousViolations(page);

  await field.fill('   ');
  await dialog.getByRole('button', { name: 'Rename' }).click();
  await expect(dialog.getByTestId('field-error')).toContainText('RST-2000');

  await field.fill('Demo shop');
  await dialog.getByRole('button', { name: 'Rename' }).click();

  await expect(dialog).toHaveCount(0);
  const row = page.getByRole('row').filter({ hasText: 'Demo shop' });
  await expect(row.getByRole('link', { name: 'Demo shop', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'octo/demo', exact: true })).toHaveCount(0);
  await row.getByRole('link', { name: 'Open for Demo shop' }).click();
  // With only a scan the page is headed "Start a run" (RF-1021); the navigation names the project.
  await expect(page).toHaveURL(/\/projects\/[^/]+$/u);
  await expect(page.getByTestId('nav-group-project').locator('.rst-nav__heading')).toHaveText(
    'Project: Demo shop',
  );
});

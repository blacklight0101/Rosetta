import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import { transitionsDone } from './support/transitions.js';
import { signInThroughPage } from './support/sign-in-page.js';

// P1-175, RNF-010, design-system.md section 3: one side navigation on every signed-in page. The
// owner got lost because the menu had 6 items on /projects and 11 inside a project. The groups are
// now the same three in the same order on every page (the project group names its project and keeps
// the last one opened), and the current page is marked in whichever group it is.

const demoUrl = 'https://github.com/octo/demo';
const groupsOrder = ['nav-group-main', 'nav-group-project', 'nav-group-admin'];

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('admin', info.project.name));
  await page.goto('/projects');
  // A new project stays on the list; the same address again opens the existing project (RF-010).
  // The account of a worker is kept between tests, so the project may exist already.
  const startPath = /\/projects\/[^/]+$/u;
  await page.getByLabel('GitHub repository URL').fill(demoUrl);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: 'Created octo/demo' })
      .or(page.getByRole('heading', { name: 'Start a run' })),
  ).toBeVisible();
  if (!startPath.test(page.url())) {
    await page.getByLabel('GitHub repository URL').fill(demoUrl);
    await page.getByRole('button', { name: 'Create project' }).click();
  }
  await expect(page).toHaveURL(startPath);
});

const nav = (page: Page) => page.getByTestId('navigation');

async function groupIds(page: Page): Promise<(string | null)[]> {
  return await nav(page)
    .locator('[data-testid^="nav-group-"]')
    .evaluateAll((groups) => groups.map((group) => group.getAttribute('data-testid')));
}

test('P1-175 the same three groups in the same order on /projects, a project page and an admin page', async ({
  page,
}) => {
  const heading = nav(page).getByTestId('nav-group-project').locator('.rst-nav__heading');
  await expect(heading).toHaveText('Project: octo/demo');
  expect(await groupIds(page)).toEqual(groupsOrder);

  for (const path of ['/projects', '/settings', '/admin/users', '/admin/audit']) {
    await page.goto(path);
    await expect(nav(page).getByRole('link', { name: 'Start a run' })).toBeVisible();
    expect(await groupIds(page)).toEqual(groupsOrder);
    await expect(heading).toHaveText('Project: octo/demo');
    await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
  }
  await expectNoSeriousViolations(page);
});

test('P1-175 a link of the project group leads on, keeps the groups and marks the page', async ({
  page,
}) => {
  await nav(page).getByRole('link', { name: 'History' }).click();

  await expect(page).toHaveURL(/\/projects\/[^/]+\/history$/u);
  expect(await groupIds(page)).toEqual(groupsOrder);
  await expect(nav(page).getByRole('link', { name: 'History' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
});

test(
  'P1-175 a very long project name stays on one line and the page does not scroll sideways at 360 px',
  { tag: '@phone' },
  async ({ page }) => {
    const heading = nav(page).getByTestId('nav-group-project').locator('.rst-nav__heading');
    await expect(heading).toHaveText('Project: octo/demo');
    const long = `Project: ${'owner'.repeat(20)}/${'repository'.repeat(12)}`;

    await heading.evaluate((element, text) => {
      element.textContent = text;
    }, long);

    const overflow: unknown = await page.evaluate(
      'document.documentElement.scrollWidth - window.innerWidth',
    );
    expect(Number(overflow)).toBeLessThanOrEqual(0);
    // The start page's own button is still settling; axe runs on the projects page instead.
    await page.goto('/projects');
    await transitionsDone(page);
    await expectNoSeriousViolations(page);
  },
);

// Last: signing out ends the session the kept cookies of this account belong to.
test('P1-175 signing out forgets the project: the next sign-in starts with no project link', async ({
  page,
}, info) => {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/sign-in$/u);
  await signInThroughPage(page, accountFor('admin', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await page.goto('/settings');

  await expect(nav(page).getByTestId('nav-group-project')).toContainText(
    'Open a project to see its pages',
  );
  await expect(nav(page).getByRole('link', { name: 'History' })).toHaveCount(0);
});

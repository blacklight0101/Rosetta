import type { Browser, Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import { clientAddressFor } from '../support/client-address.js';
import { repositories } from '../support/journey-pages.js';
import { ensureProject, startAndOpenLiveRun } from '../support/live-run-page.js';
import { accountFor } from '../support/seed.js';
import { e2eOrigin } from '../support/server-config.js';
import { signInThroughPage } from '../support/sign-in-page.js';

// RF-1105, RF-010, RF-1001, RNF-005, P1-46: two users cannot see each other's work (flow 5). The
// first user creates a project and scans it; the second signs in from another browser and finds
// none of it: not in the list, and the pages of the project, its cost, its run and the run's files
// answer as an unknown id does. The second user's own project for the same address is another
// project. Both sign in through the sign-in page.

/** A browser of its own for the second user (cookies are not shared with the first). */
async function otherUsersPage(browser: Browser, address: string): Promise<Page> {
  const context = await browser.newContext({
    baseURL: e2eOrigin(),
    extraHTTPHeaders: { 'x-forwarded-for': clientAddressFor(address) },
  });
  return context.newPage();
}

test('RF-1105 a second user finds nothing of the first one project or run', async ({
  browser,
  page,
}, info) => {
  const project = info.project.name;
  await signInThroughPage(page, accountFor('journey-owner', project));
  await page.getByLabel('GitHub repository URL').fill(repositories.demo);
  await page.getByRole('button', { name: 'Create project' }).click();
  await page.getByRole('link', { name: 'Start run for octo/demo' }).click();
  await page.getByLabel('Scan only').check();
  const runPath = await startAndOpenLiveRun(page);
  await expect(page.getByTestId('run-status')).toContainText('Completed', { timeout: 60_000 });
  await page.goBack();
  const startPath = new URL(page.url()).pathname;
  const costPath = startPath.replace(/\/start$/u, '/cost');

  const other = await otherUsersPage(browser, `second:${project}`);
  await signInThroughPage(other, accountFor('journey-other', project));
  await expect(other).toHaveURL(/\/projects$/u);
  await expect(other.getByText('No projects yet')).toBeVisible();
  await expect(other.getByRole('link', { name: 'Start run for octo/demo' })).toHaveCount(0);
  for (const path of [startPath, costPath, runPath]) {
    await other.goto(path);
    await expect(other.getByTestId('error-banner')).toContainText('RST-2003');
  }
  const files = await other.goto(`${runPath}/files/scan-summary.md`);
  expect(files?.status()).toBe(404);
  await other.goto('/projects');
  await ensureProject(other, repositories.demo);
  await expect(other.getByRole('row').filter({ hasText: 'octo/demo' })).toHaveCount(1);
  await other.context().close();

  await page.goto('/projects');
  await expect(page.getByRole('row').filter({ hasText: 'octo/demo' })).toHaveCount(1);
  await expectNoSeriousViolations(page);
});

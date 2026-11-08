import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import { openScanRun, openStartPage, runStatus, startUnderstand } from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-1008, RF-1108, RF-1010, P1-105: the run columns and the queue notice of the Projects page,
// driven by real runs of the test server. A scan that completed shows as the last run with its
// state and counts; a run that waits in the real queue (the reader of the `Controllers` area is
// held until the run is stopped, e2e-provider.ts, and one user has at most one running run) shows
// its position and is cancelled from the notice. The page never scrolls sideways, at 360 px
// either (verdict on #268; @phone, so phone-light runs that test on its own and scans first when the
// project has no run). The steps run in order because they share one project and its runs.

test.describe.configure({ mode: 'serial' });

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('project-runs', info.project.name));
});

function projectRow(page: Page): Locator {
  return page.getByRole('row').filter({ hasText: 'octo/webforms' });
}

async function openProjects(page: Page): Promise<void> {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
}

/** `scrollWidth <= innerWidth`: nothing of the page is beside the viewport. */
async function noSidewaysScroll(page: Page): Promise<void> {
  const overflow: unknown = await page.evaluate(
    'document.documentElement.scrollWidth - window.innerWidth',
  );
  expect(Number(overflow)).toBeLessThanOrEqual(0);
}

test('RF-1008 a completed scan shows as its position in the journey, the last run and the cost', async ({
  page,
}) => {
  await openStartPage(page);
  await openScanRun(page);

  await openProjects(page);

  const row = projectRow(page);
  await expect(row.getByRole('cell').nth(2)).toContainText('Start a run');
  await expect(row).not.toContainText('scan ·');
  await expect(row).not.toContainText('Completed');
  await expect(row.getByRole('cell').nth(3)).toHaveText(/^\d{1,2} [A-Z][a-z]{2}, \d{2}:\d{2}$/u);
  await expect(row.getByRole('cell').nth(4)).toHaveText('$0.00');
  await expect(page.getByTestId('queue-notice')).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test('RF-1108 a queued run shows its position on the Projects page and Cancel ends it', async ({
  page,
}) => {
  const held = await startUnderstand(page, ['Controllers']);
  await startUnderstand(page, ['Catalog']);
  await expect(runStatus(page)).toContainText('Queued');

  await openProjects(page);

  const notice = page.getByTestId('queue-notice');
  await expect(notice).toContainText(
    /Your understand run of octo\/webforms is queued, position \d+, (?:no run|\d+ runs?) ahead\./u,
  );
  // P8-137: the row says what the project page says beside its title; the place in the queue is under it.
  await expect(projectRow(page)).toContainText('Understand running');
  await expect(projectRow(page)).toContainText(/position \d+/u);
  await expectNoSeriousViolations(page);
  await notice.getByRole('button', { name: /Cancel queued run/u }).click();
  await expect(notice).toHaveCount(0);
  // P8-111: a run cancelled while it waited never reads "Stopped by you".
  await expect(projectRow(page)).toContainText('Understand cancelled while queued');
  await expect(projectRow(page)).not.toContainText('Stopped by you');
  await page.goto(held);
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Stopped by you', { timeout: 30_000 });
});

test(
  'RF-1008 the Projects page with its columns never scrolls sideways',
  { tag: '@phone' },
  async ({ page }) => {
    await openScannedStartPage(page);
    await openProjects(page);
    await expect(projectRow(page)).toBeVisible();

    await noSidewaysScroll(page);
  },
);

test('RF-430 the start button names the figure the user approves', async ({ page }) => {
  await openScannedStartPage(page);

  await expect(page.getByRole('button', { name: /^Analyse · approve /u })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('journey-total')).toContainText('What stops it');
});

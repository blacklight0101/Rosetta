import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openScannedStartPage } from './support/cost-run.js';
import {
  openStartPage,
  runStatus,
  startAndOpenLiveRun,
  startUnderstand,
} from './support/live-run-page.js';
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

test('RF-1008 a completed scan shows as the last run with its state and the project counts', async ({
  page,
}) => {
  await openStartPage(page);
  await page.getByLabel('Scan only').check();
  await startAndOpenLiveRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });

  await openProjects(page);

  const row = projectRow(page);
  await expect(row).toContainText('scan ·');
  await expect(row).toContainText('Completed');
  await expect(row.getByRole('cell').nth(3)).toHaveText('1');
  await expect(row).toContainText('$0.00');
  await expect(page.getByTestId('queue-notice')).toHaveCount(0);
  await expectNoSeriousViolations(page);
});

test('RF-1108 a queued run shows its position on the Projects page and Cancel ends it', async ({
  page,
}) => {
  const held = await startUnderstand(page, ['Controllers']);
  await openStartPage(page);
  await page.getByLabel('Scan only').check();
  await page.getByRole('button', { name: /^Start run/u }).click();
  await expect(page.getByTestId('run-notice')).toContainText('Queued');

  await openProjects(page);

  const notice = page.getByTestId('queue-notice');
  await expect(notice).toContainText(/Your scan run of octo\/webforms is queued, position \d+\./u);
  await expect(projectRow(page)).toContainText('Queued');
  await expect(projectRow(page)).toContainText(/position \d+/u);
  await expectNoSeriousViolations(page);
  await notice.getByRole('button', { name: /Cancel queued run/u }).click();
  await expect(notice).toHaveCount(0);
  await expect(projectRow(page)).toContainText('Interrupted');
  await page.goto(held);
  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });
});

test(
  'RF-1008 the Projects page with its run columns never scrolls sideways',
  { tag: '@phone' },
  async ({ page }) => {
    await openScannedStartPage(page);
    await openProjects(page);
    await expect(projectRow(page)).toBeVisible();

    await noSidewaysScroll(page);
  },
);

test('RF-430 the start button names the journey figure the user approves', async ({ page }) => {
  await openScannedStartPage(page);

  await expect(page.getByRole('button', { name: /^Start run · approve /u })).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId('journey-total')).toContainText('worst case');
});

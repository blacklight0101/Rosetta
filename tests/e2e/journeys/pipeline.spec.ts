import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import {
  buildReport,
  chooseAreas,
  openProjectStart,
  repositories,
  runScan,
} from '../support/journey-pages.js';
import {
  agentPanel,
  openRunTab,
  runStatus,
  startAndOpenLiveRun,
  valueOf,
} from '../support/live-run-page.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { transitionsDone } from '../support/transitions.js';

// RF-010, RF-1001, RF-1002, RF-504, RF-506, RF-1100, RNF-005, P1-46: the first journey of the
// milestone, start to end through the pages and the real server (flow 1): sign in, create a
// project, scan it, understand one area while watching the live page, build the report, read it as
// Markdown and as a page, open the replay and download the zip. The model double replays the
// recorded run of the C# fixture (e2e-provider.ts); nothing of the API or the event stream is
// replaced.

/** The address a link of the run page leads to. */
async function hrefOf(page: Page, name: string): Promise<string> {
  const href = await page.getByRole('link', { name, exact: true }).getAttribute('href');
  if (href === null) throw new Error(`The link ${name} has no address.`);
  return href;
}

/** Watches the understand run of the Catalog area on its live page until it has ended complete. */
async function watchCatalogRun(page: Page): Promise<void> {
  // The run is short: the running page is checked by live-run-running.spec.ts, so this journey
  // waits for the end and reads the page of the ended run.
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  await transitionsDone(page);
  await expectNoSeriousViolations(page);
  // The page of an ended run opens on the overview of the application; the agents and the claims
  // are in the Evidence tab.
  await expect(page.getByRole('region', { name: 'Overview of the application' })).toBeVisible();
  await openRunTab(page, 'Evidence');
  const overview = page.getByRole('region', { name: 'Overview', exact: true });
  await expect(valueOf(overview, 'Done')).toHaveText('1');
  await expect(valueOf(overview, 'Failed')).toHaveText('0');
  await expect(agentPanel(page, 'Catalog')).toContainText('BR-001');
  const claims = page.getByRole('region', { name: 'Claims' }).getByTestId('claim');
  await expect(claims).not.toHaveCount(0);
}

/** Builds the report, then reads it as Markdown and as a page, and opens the replay. */
async function readReportAndReplay(page: Page): Promise<void> {
  await buildReport(page);
  await expectNoSeriousViolations(page);
  // The report and the replay are pages of their own, so the run page forgets that the report was
  // built: the links are taken first.
  const report = await hrefOf(page, 'Open the report');
  const replay = await hrefOf(page, 'Open the run replay');
  await page.getByRole('link', { name: 'Open the report as Markdown' }).click();
  await expect(page.locator('body')).toContainText('# Report for run');
  await expect(page.locator('body')).toContainText('BR-001');
  await page.goto(report);
  await expect(page.getByRole('heading', { name: 'Run report', level: 1 })).toBeVisible();
  await expect(page.getByText('BR-001').first()).toBeVisible();
  await expectNoSeriousViolations(page);
  await page.goto(replay);
  await expect(page.getByRole('heading', { name: 'Run replay', level: 1 })).toBeVisible();
  await expectNoSeriousViolations(page);
}

test('RF-1001 RF-1002 RF-504 RF-506 from sign-in to the Markdown report, the replay and the zip', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await signInThroughPage(page, accountFor('journey-run', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);

  await openProjectStart(page, repositories.webforms);
  const scan = await runScan(page);
  await expect(page.getByText('This run has no agents')).toBeVisible();
  await expectNoSeriousViolations(page);

  await openProjectStart(page, repositories.webforms);
  await chooseAreas(page, ['Catalog']);
  const understand = await startAndOpenLiveRun(page);
  expect(understand).not.toBe(scan);
  await watchCatalogRun(page);
  await readReportAndReplay(page);

  await page.goto(understand);
  await expect(runStatus(page)).toContainText('Completed');
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('link', { name: 'Download zip' }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-understand\.zip$/u);
});

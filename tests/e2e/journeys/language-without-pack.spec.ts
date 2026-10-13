import { expect, test } from '../support/fixtures.js';
import { expectNoSeriousViolations } from '../support/axe.js';
import {
  buildReport,
  chooseAreas,
  openProjectStart,
  repositories,
  runScan,
} from '../support/journey-pages.js';
import { runStatus, startAndOpenLiveRun } from '../support/live-run-page.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';

// RF-112, RF-105, RF-504, P1-46: a repository in a language without a pack (the COBOL fixture,
// `octo/ledger`) goes through the whole pipeline in the browser: scan, understand and report all
// complete, and the scan summary says every area is mapped coarsely. The model double answers the
// readers with plain text (e2e-provider.ts), as it does for any repository it has no recording for.

test('RF-112 a repository without a language pack completes scan, understand and report', async ({
  page,
}, info) => {
  test.setTimeout(180_000);
  await signInThroughPage(page, accountFor('journey-language', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);
  await openProjectStart(page, repositories.ledger);

  const scan = await runScan(page);
  const summary = await page.goto(`${scan}/files/scan-summary.md`);
  expect(summary?.status()).toBe(200);
  await expect(page.locator('body')).toContainText('Map level');
  await expect(page.locator('body')).toContainText('coarse');
  await expect(page.locator('body')).not.toContainText('symbols');

  await openProjectStart(page, repositories.ledger);
  await chooseAreas(page, 'all');
  const understand = await startAndOpenLiveRun(page);
  expect(understand).not.toBe(scan);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 90_000 });
  await expectNoSeriousViolations(page);

  await buildReport(page);
  const report = await page
    .getByRole('link', { name: 'Open the report', exact: true })
    .getAttribute('href');
  await page.getByRole('link', { name: 'Open the report as Markdown' }).click();
  await expect(page.locator('body')).toContainText('# Report for run');
  await page.goto(report ?? '');
  await expect(page.getByRole('heading', { name: 'Run report', level: 1 })).toBeVisible();
  await expectNoSeriousViolations(page);
});

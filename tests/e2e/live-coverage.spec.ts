import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import {
  agentPanel,
  openStartPage,
  runStatus,
  startAndOpenLiveRun,
  startUnderstand,
} from './support/live-run-page.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-1005, DEC-51, P1-38: the coverage map of the live run page, driven by a real understand run of
// the test server. The model double replays the recorded understand run of the C# fixture
// (e2e-provider.ts): the `(root)` reader reads `Default.aspx.cs`, the `Services` reader reads
// `Services/CatalogService.cs`, and the `Controllers` reader never answers until the run is
// stopped. With two parallel readers (set on the project settings page) the run is still running
// while the map fills in. An understand run needs a completed scan of the project, so the test scans
// first. Nothing of the API or the event stream is replaced.

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('live-coverage', info.project.name));
});

function coverageOf(page: Page, area: string): Locator {
  return page
    .getByRole('region', { name: 'Coverage map' })
    .getByRole('region', { name: `Coverage of ${area}`, exact: true });
}

function readShare(page: Page, area: string): Locator {
  return coverageOf(page, area).getByRole('meter', { name: `Read share of ${area}` });
}

/** Lets two reader tasks run at once, so a held reader does not keep the others from starting. */
async function twoParallelReaders(page: Page): Promise<void> {
  await page.goto('/projects');
  await page.getByRole('link', { name: 'Settings for octo/webforms' }).click();
  await page.getByLabel('Parallel readers', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
}

test('RF-1005 the coverage map of a running run fills in by area and by read share as files are read', async ({
  page,
}) => {
  test.setTimeout(120_000); // a scan, then an understand run at one recorded step in 700 ms
  await openStartPage(page);
  await twoParallelReaders(page);
  await openStartPage(page);
  await page.getByLabel('Scan only').check();
  await startAndOpenLiveRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });

  await startUnderstand(page, ['(root)', 'Controllers', 'Services']);
  const map = page.getByRole('region', { name: 'Coverage map' });
  await expect(map).toBeVisible();
  await expect(coverageOf(page, 'Controllers')).toBeVisible();

  await expect(agentPanel(page, '(root)')).toContainText('Done', { timeout: 30_000 });
  await expect(agentPanel(page, 'Services')).toContainText('Done', { timeout: 30_000 });

  await expect(runStatus(page)).toContainText('Running');
  await expect(coverageOf(page, '(root)').getByRole('listitem')).toHaveText(['Default.aspx.cs']);
  const services = coverageOf(page, 'Services');
  await expect(services.getByRole('listitem').first()).toContainText('Services/');
  await expect(services.getByText('CatalogService.cs', { exact: true })).toBeVisible();
  await expect(readShare(page, '(root)')).toHaveAttribute('aria-valuenow', '50');
  await expect(readShare(page, 'Services')).toHaveAttribute('aria-valuenow', '50');
  await expect(coverageOf(page, 'Controllers')).toContainText('No files read yet');
  await expect(readShare(page, 'Controllers')).toHaveAttribute('aria-valuenow', '0');
  await expect(map).toContainText('2 files read in 2 areas');
  await expectNoSeriousViolations(page);

  await page.getByRole('button', { name: 'Stop run' }).click();
  await expect(runStatus(page)).toContainText('Interrupted', { timeout: 30_000 });
  await expect(coverageOf(page, 'Services')).toContainText('CatalogService.cs');
});

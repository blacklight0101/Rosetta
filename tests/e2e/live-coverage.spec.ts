import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import {
  agentPanel,
  openRunTab,
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

// Each test signs in to an account of its own (P1-141): both tests scan and run the same project, so
// with one shared account their projects, settings and runs could interfere.

function coverageOf(page: Page, area: string): Locator {
  return page
    .getByRole('region', { name: 'Coverage map' })
    .getByRole('region', { name: `Coverage of ${area}`, exact: true });
}

function readShare(page: Page, area: string): Locator {
  return coverageOf(page, area).getByRole('meter', { name: `Read share of ${area}` });
}

/** The number in the pause counter ("12 events waiting"); 0 when the counter is not shown. */
async function waitingEvents(page: Page): Promise<number> {
  const shown = await page
    .getByTestId('pause-count')
    .textContent({ timeout: 1000 })
    .catch(() => null);
  return Number(/(\d+) events? waiting/u.exec(shown ?? '')?.[1] ?? 0);
}

/** Lets two reader tasks run at once, so a held reader does not keep the others from starting. */
async function twoParallelReaders(page: Page): Promise<void> {
  await page.goto('/projects');
  await page.getByRole('link', { name: 'Settings for octo/webforms' }).click();
  await page.getByLabel('Parallel readers', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByText('Settings saved.')).toBeVisible();
}

/** A completed scan of the project: an understand run needs one. */
async function scanProject(page: Page): Promise<void> {
  await openStartPage(page);
  await page.getByLabel('Scan only').check();
  await startAndOpenLiveRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
}

test('RF-1005 the coverage map of a running run fills in by area and by read share as files are read', async ({
  context,
  page,
}, info) => {
  test.setTimeout(120_000); // a scan, then an understand run at one recorded step in 700 ms
  await signInAs(context, accountFor('live-coverage', info.project.name));
  await openStartPage(page);
  await twoParallelReaders(page);
  await scanProject(page);

  await startUnderstand(page, ['(root)', 'Controllers', 'Services']);
  await openRunTab(page, 'All agents');
  const map = page.getByRole('region', { name: 'Coverage map' });
  // The condition the map depends on: the first `read_file` event is applied to the tree. The
  // planned areas, Controllers among them, are on the map by then.
  await expect(
    coverageOf(page, '(root)').getByText('Default.aspx.cs', { exact: true }),
  ).toBeVisible({ timeout: 30_000 });
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

test('RF-1005 RF-1002 Pause updates freezes the coverage map while read_file events keep arriving, and Resume applies the held reads', async ({
  context,
  page,
}, info) => {
  test.setTimeout(120_000);
  await signInAs(context, accountFor('live-coverage-pause', info.project.name));
  await scanProject(page);
  // One reader at a time: `(root)` reads Default.aspx.cs first, `Services` reads CatalogService.cs after it.
  await startUnderstand(page, ['(root)', 'Services']);
  await openRunTab(page, 'All agents');
  const map = page.getByRole('region', { name: 'Coverage map' });
  const root = coverageOf(page, '(root)');
  await expect(root.getByText('Default.aspx.cs', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(map).toContainText('1 file read in 1 area');
  const services = coverageOf(page, 'Services');
  await expect(services).toContainText('No files read yet');

  await page.getByRole('button', { name: 'Pause updates' }).click();
  const frozen = {
    map: await map.innerHTML(),
    share: await readShare(page, '(root)').getAttribute('aria-valuenow'),
  };
  // The Services reader reads CatalogService.cs behind the pause: its `read_file` events wait.
  await expect.poll(() => waitingEvents(page), { timeout: 30_000 }).toBeGreaterThan(7);
  await expect(services).toContainText('No files read yet');
  await expect(services.getByText('CatalogService.cs')).toHaveCount(0);
  expect(await map.innerHTML()).toBe(frozen.map);
  expect(await readShare(page, '(root)').getAttribute('aria-valuenow')).toBe(frozen.share);

  await page.getByRole('button', { name: 'Resume' }).click();

  await expect(services.getByText('CatalogService.cs', { exact: true })).toBeVisible({
    timeout: 30_000,
  });
  await expect(map).toContainText('2 files read in 2 areas');
  await expect(readShare(page, '(root)')).toHaveAttribute('aria-valuenow', '50');
  await expect(readShare(page, 'Services')).toHaveAttribute('aria-valuenow', '50');
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
});

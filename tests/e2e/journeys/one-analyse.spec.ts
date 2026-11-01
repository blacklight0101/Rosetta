import { expect, test } from '../support/fixtures.js';
import { chooseAreas } from '../support/journey-pages.js';
import { pressStart, runStatus } from '../support/live-run-page.js';
import { accountFor } from '../support/seed.js';
import { signInThroughPage } from '../support/sign-in-page.js';
import { fixtureZip, uploadFromNewProject } from '../support/zip-journey.js';

// RF-160, RF-434, RF-1019, ADR-027, DEC-204: from an upload to a finished understand run takes two
// clicks, upload and Analyse. The free scan starts by itself, the page lists what it found with one
// estimate for the journey, and Analyse opens the live page of the run with nothing to click.

test('RF-160 RF-434 RF-1019 an upload reaches a finished understand run with the upload and Analyse clicks', async ({
  page,
}, info) => {
  test.setTimeout(240_000);
  await signInThroughPage(page, accountFor('one-analyse', info.project.name));
  await expect(page).toHaveURL(/\/projects$/u);

  await uploadFromNewProject(page, 'OrderDesk.zip', await fixtureZip());

  // The scan started by itself: there is no "scan only" choice and no Open-the-live-run link.
  await expect(page.getByLabel('Scan only')).toHaveCount(0);
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(areas.locator('label').first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('table', { name: 'Estimate per role' })).toBeVisible();
  await chooseAreas(page, ['Catalog']);

  await pressStart(page);

  await expect(page).toHaveURL(/\/runs\//u);
  await expect(page.getByRole('link', { name: 'Open the live run' })).toHaveCount(0);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 120_000 });
});

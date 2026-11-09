import type { Page, Route } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';
import {
  fixtureZip,
  secondVersion,
  uploadFromNewProject,
  uploadZip,
} from './support/zip-journey.js';

// RF-160, RF-1021, P8-106, P8-121: a source that replaces the one a project held is scanned again, and
// until that scan has ended the page offers nothing that starts a run on the old code map. The page
// asks the history for the project's newest scan before it starts the new one, so a slow history is
// the moment the old areas and Analyse used to stay on the page (a run started then read the scan
// of the source that was replaced, #1201). The history is held here, the technique of
// project-page-states.spec.ts, so that moment lasts as long as the test needs.

test.beforeEach(async ({ context }, info) => {
  await signInAs(context, accountFor('projects', info.project.name));
});

/** Holds every answer of the history until `release` is called; returns the function that lets them go. */
async function holdHistory(page: Page): Promise<() => void> {
  let release = (): void => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/projects/*/history', async (route: Route) => {
    await gate;
    await route.continue();
  });
  return release;
}

test('RF-160 P8-106 a replaced source hides the old areas and Analyse while its history is not read', async ({
  page,
}) => {
  test.setTimeout(240_000);
  await uploadFromNewProject(page, 'OrderDesk.zip', await fixtureZip());
  const analyse = page.getByRole('button', { name: /^Analyse/u });
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  // The first scan ends by itself: the old code map is on the page, with Analyse.
  await expect(areas.locator('label').first()).toBeVisible({ timeout: 60_000 });
  await expect(analyse).toBeVisible();

  const release = await holdHistory(page);
  await uploadZip(page, 'OrderDesk-v2.zip', await fixtureZip(secondVersion));

  // The new source is on the page and the scan of it has not started: only the scan section shows.
  await expect(page.getByTestId('scan-running')).toBeVisible();
  await expect(analyse).toHaveCount(0);
  await expect(areas).toHaveCount(0);

  release();
  await expect(areas.locator('label').first()).toBeVisible({ timeout: 60_000 });
  await expect(analyse).toBeVisible();
  await expect(page.getByTestId('scan-running')).toHaveCount(0);
});

import type { Page } from '@playwright/test';
import { expect } from './fixtures.js';

// RF-1021, P8-26: a project that has a run folds its areas, estimate and Analyse under "Start another
// run" (open when the journey has to start again). The page shows nothing below its strip until the
// journey is read (`data-journey="read"`), so this waits for that and opens the fold when it is there.

/** Waits for the project page to read its journey and opens "Start another run" when it is folded. */
export async function showStartChoices(page: Page): Promise<void> {
  await expect(page.locator('.rst-start[data-journey="read"]')).toBeVisible({ timeout: 30_000 });
  const fold = page.getByTestId('start-another');
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  // The areas appear once the estimate has loaded: wait for them (open or folded) or for the scan.
  await expect(
    fold
      .or(areas)
      .or(page.getByRole('region', { name: 'Scan' }))
      .first(),
  ).toBeAttached({
    timeout: 90_000,
  });
  if ((await fold.count()) > 0 && (await fold.getAttribute('open')) === null) {
    await fold.locator(':scope > summary').click();
  }
}

/** Opens "Replace the source" when the project page folds the upload form there. */
export async function openReplaceSource(page: Page): Promise<void> {
  const fold = page.getByTestId('replace-source');
  const form = page.getByLabel('Zip file').or(page.getByLabel('Workbook files'));
  await expect(form.or(fold).first()).toBeAttached({ timeout: 30_000 });
  if ((await fold.count()) > 0 && (await fold.getAttribute('open')) === null) {
    await fold.locator(':scope > summary').click();
  }
}

/** Waits for the areas of the code map (a scan may still be running) and opens them when folded. */
export async function revealAreas(page: Page): Promise<void> {
  const fold = page.getByTestId('start-another');
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(fold.or(areas).first()).toBeAttached({ timeout: 90_000 });
  if ((await fold.count()) > 0 && (await fold.getAttribute('open')) === null) {
    await fold.locator(':scope > summary').click();
  }
}

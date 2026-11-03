import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.js';

// RF-1021, P8-26: a project that has a run folds its areas, estimate and Analyse under "Start another
// run" (open when the journey has to start again). The page shows nothing below its strip until the
// journey is read (`data-journey="read"`), so this waits for that and opens the fold when it is there.

/**
 * Leaves a folded section open by the user's own choice (P8-106). The page opens a fold by itself while
 * the journey has to start again and closes it again when the journey no longer asks for it, unless the
 * user chose: the page keeps the choice of a toggle by the user. So a fold that is open only because the
 * page opened it is closed and opened again here, which makes the choice, and a fold that is closed is
 * opened. The open state is asserted and everything is tried again until it holds. A section the page
 * does not fold (no such element) is left as it is.
 */
async function openFold(fold: Locator): Promise<void> {
  if ((await fold.count()) === 0) return;
  const summary = fold.locator(':scope > summary');
  await expect(async () => {
    if ((await fold.getAttribute('open')) !== null) {
      await summary.click();
      await expect(fold).not.toHaveAttribute('open', '', { timeout: 2_000 });
    }
    await summary.click();
    await expect(fold).toHaveAttribute('open', '', { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

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
  await openFold(fold);
}

/** Opens "Replace the source" when the project page folds the upload form there. */
export async function openReplaceSource(page: Page): Promise<void> {
  const fold = page.getByTestId('replace-source');
  const form = page.getByLabel('Zip file').or(page.getByLabel('Workbook files'));
  await expect(form.or(fold).first()).toBeAttached({ timeout: 30_000 });
  await openFold(fold);
}

/** Waits for the areas of the code map (a scan may still be running) and opens them when folded. */
export async function revealAreas(page: Page): Promise<void> {
  const fold = page.getByTestId('start-another');
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(fold.or(areas).first()).toBeAttached({ timeout: 90_000 });
  await openFold(fold);
}

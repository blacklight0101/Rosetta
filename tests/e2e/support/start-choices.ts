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

/**
 * Leaves the choices shown the way a person finds them. The page scans the project by itself when it
 * loads (RF-160) and shows only the Scan section until the scan ends, then the folds again as they
 * were left (RF-1021). So the fold is opened, and the state is accepted only when no scan runs and no
 * fold is closed, still so a second later (the page decides on its scan within a fraction of a
 * second); otherwise everything is tried again. A fold that was not there yet is no fold to open
 * (P8-106, RF-157).
 */
async function openSettled(page: Page, fold: Locator): Promise<void> {
  const running = page.getByTestId('scan-running');
  const closed = page.locator('[data-testid="start-another"]:not([open])');
  const settled = async (): Promise<void> => {
    await expect(running).toHaveCount(0, { timeout: 3_000 });
    await expect(closed).toHaveCount(0, { timeout: 3_000 });
  };
  await expect(async () => {
    await openFold(fold);
    await settled();
    await page.waitForTimeout(1_000);
    await settled();
  }).toPass({ timeout: 90_000 });
}

/** Waits for the project page to read its journey and opens "Start another run" when it is folded. */
export async function showStartChoices(page: Page): Promise<void> {
  await expect(page.locator('.rst-start[data-journey="read"]')).toBeVisible({ timeout: 30_000 });
  const fold = page.getByTestId('start-another');
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(
    fold
      .or(areas)
      .or(page.getByRole('region', { name: 'Scan' }))
      .first(),
  ).toBeAttached({ timeout: 90_000 });
  await openSettled(page, fold);
}

/** Opens "Replace the source" when the project page folds the upload form there. */
export async function openReplaceSource(page: Page): Promise<void> {
  const fold = page.getByTestId('replace-source');
  const form = page.getByLabel('Zip file').or(page.getByLabel('Workbook files'));
  await expect(form.or(fold).first()).toBeAttached({ timeout: 30_000 });
  await openFold(fold);
}

/**
 * Waits for the areas of the code map (a scan may still be running) and opens them when folded. The
 * page hides the choices while it scans, which is on every load and after a source is replaced, and
 * shows them again afterwards in the fold as it was left; a fold that came back closed is opened
 * again until the areas are listed (P8-106).
 */
export async function revealAreas(page: Page): Promise<void> {
  const fold = page.getByTestId('start-another');
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(fold.or(areas).first()).toBeAttached({ timeout: 90_000 });
  await openSettled(page, fold);
}

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
 * Leaves the choices shown the way a person finds them. The page scans the project when it has no
 * scan in its history, when its source was replaced and when the user presses "Scan again"; a project
 * whose scan has completed is not scanned on a load (P8-106, RF-160). While a scan runs the page shows
 * only the Scan section, and it shows the areas once its estimate is read (RF-1021). So the fold is
 * opened, and the state is accepted when no scan runs, no fold is closed and the areas are listed,
 * which the page does only after the scan, if there is one, has ended. There is no fixed wait: a
 * state the page has not reached shows as a missing area, and everything is tried again (P8-106,
 * P8-121, RF-157).
 */
async function openSettled(page: Page, fold: Locator): Promise<void> {
  const running = page.getByTestId('scan-running');
  const closed = page.locator('[data-testid="start-another"]:not([open])');
  const areas = page.getByRole('group', { name: 'Areas from the code map' }).locator('label');
  await expect(async () => {
    await openFold(fold);
    await expect(running).toHaveCount(0, { timeout: 3_000 });
    await expect(closed).toHaveCount(0, { timeout: 3_000 });
    await expect(areas.first()).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
}

/**
 * What a caller wants of the project page after it loaded: `settled` is the page a person works on
 * (the scan, if the page starts one, has ended and "Start another run" is open); `scanning` is the
 * page while a scan the page started (no scan in the history, a replaced source) is still the only
 * thing it shows (RF-160).
 */
export type StartPageState = 'settled' | 'scanning';

/**
 * Waits for the project page to read its journey and for its first section: the fold, the areas, or
 * the Scan section. Returns the fold, which does not exist on a project without a run.
 */
async function waitForStartPage(page: Page): Promise<Locator> {
  await expect(page.locator('.rst-start[data-journey="read"]')).toBeVisible({ timeout: 30_000 });
  const fold = page.getByTestId('start-another');
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(
    fold
      .or(areas)
      .or(page.getByRole('region', { name: 'Scan' }))
      .first(),
  ).toBeAttached({ timeout: 90_000 });
  return fold;
}

/**
 * Leaves the project page in the state the caller asks for. `scanning` stops once the page has read
 * its journey and shows its Scan section: the caller asserts what the scan shows (`scan-running`),
 * which `settled` waits past, so the two states must not be mixed up (P8-106, RF-160). `settled` is
 * what `showStartChoices` does.
 */
export async function showStartPage(page: Page, state: StartPageState): Promise<void> {
  const fold = await waitForStartPage(page);
  if (state === 'settled') await openSettled(page, fold);
}

/** Waits for the project page to read its journey and opens "Start another run" when it is folded. */
export async function showStartChoices(page: Page): Promise<void> {
  await showStartPage(page, 'settled');
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
 * page hides the choices while it scans, which it does when the history holds no scan, after a source
 * is replaced and after "Scan again" (not on every load), and shows them again afterwards in the fold
 * as it was left; a fold that came back closed is opened again until the areas are listed (P8-106).
 */
export async function revealAreas(page: Page): Promise<void> {
  const fold = page.getByTestId('start-another');
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(fold.or(areas).first()).toBeAttached({ timeout: 90_000 });
  await openSettled(page, fold);
}

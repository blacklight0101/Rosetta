import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.js';
import { openStartPage, pressStart } from './live-run-page.js';

// RF-1010, P1-36: what the totals spec does on the start page and the live page, so the spec reads
// as steps. The runs replay the recorded understand run of the C# fixture (serve.ts).

/** The number before "tokens" in the pill. */
export async function tokensOf(pill: Locator): Promise<number> {
  const text = (await pill.textContent()) ?? '';
  const match = /([\d,]+) tokens/u.exec(text);
  return Number((match?.[1] ?? 'NaN').replaceAll(',', ''));
}

/** Presses Start and follows the notice to the live page. */
async function startAndFollow(page: Page): Promise<void> {
  await pressStart(page);
  await expect(page.getByRole('heading', { name: 'Live run', level: 1 })).toBeVisible();
}

/** Opens the start page of the account's project, after a scan when it has no code map yet. */
export async function openScannedStartPage(page: Page): Promise<void> {
  await openStartPage(page);
  const areas = page.getByRole('group', { name: 'Areas from the code map' }).locator('label');
  // RF-160: the scan starts by itself; the areas appear when it ends.
  await expect(areas.first()).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole('button', { name: /^Analyse/u })).toBeVisible({ timeout: 15_000 });
}

/** Starts an understand run of the Catalog area and follows the notice to the live page. */
export async function startCatalogRun(page: Page): Promise<void> {
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(areas.locator('label').first()).toBeVisible();
  for (const label of await areas.locator('label').allTextContents()) {
    await areas.getByLabel(label.trim(), { exact: true }).setChecked(label.trim() === 'Catalog');
  }
  await startAndFollow(page);
}

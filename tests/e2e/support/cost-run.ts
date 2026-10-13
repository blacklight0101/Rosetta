import type { Locator, Page } from '@playwright/test';
import { SystemClock } from '../../../src/infrastructure/system/system-clock.js';
import { expect, test } from './fixtures.js';
import { openStartPage, runStatus } from './live-run-page.js';

// RF-1010, P1-36: what the totals spec does on the start page and the live page, so the spec reads
// as steps. The runs replay the recorded understand run of the C# fixture (serve.ts).

/** The harness clock, as seed-cost.ts uses it: the same system time the servers run on. */
const clock = new SystemClock();

const PROJECT_NAMES = ['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark'];

/**
 * Waits for a second of this project's own before the run starts: the odd seconds modulo eight, as
 * live-run-page.ts keeps the even ones, so no two runs of the e2e servers start in the same second
 * (see OPEN QUESTIONS of P1-35).
 */
async function waitForOwnOddSecond(): Promise<void> {
  const slot = Math.max(0, PROJECT_NAMES.indexOf(test.info().project.name)) * 2 + 1;
  while (Math.floor(clock.now().getTime() / 1000) % (PROJECT_NAMES.length * 2) !== slot) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** The number before "tokens" in the pill. */
export async function tokensOf(pill: Locator): Promise<number> {
  const text = (await pill.textContent()) ?? '';
  const match = /([\d,]+) tokens/u.exec(text);
  return Number((match?.[1] ?? 'NaN').replaceAll(',', ''));
}

/** Presses Start and follows the notice to the live page. */
async function startAndFollow(page: Page): Promise<void> {
  await waitForOwnOddSecond();
  await page.getByRole('button', { name: /^Start run/u }).click();
  const notice = page.getByTestId('run-notice');
  await expect(notice).toContainText(/Run started|Queued/u);
  await notice.getByRole('link', { name: 'Open the live run' }).click();
  await expect(page.getByRole('heading', { name: 'Live run', level: 1 })).toBeVisible();
}

/** Opens the start page of the account's project, after a scan when it has no code map yet. */
export async function openScannedStartPage(page: Page): Promise<void> {
  await openStartPage(page);
  const understand = page.getByLabel('Understand');
  const scanFirst = page.getByText('Run a scan first');
  const areas = page.getByRole('group', { name: 'Areas from the code map' }).locator('label');
  await expect(scanFirst.or(areas.first())).toBeVisible({ timeout: 15_000 });
  if (await understand.isEnabled()) return;
  await page.getByLabel('Scan only').check();
  await startAndFollow(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  await openStartPage(page);
  await expect(understand).toBeEnabled({ timeout: 15_000 });
}

/** Starts an understand run of the Catalog area and follows the notice to the live page. */
export async function startCatalogRun(page: Page): Promise<void> {
  await page.getByLabel('Understand').check();
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(areas.locator('label').first()).toBeVisible();
  for (const label of await areas.locator('label').allTextContents()) {
    await areas.getByLabel(label.trim(), { exact: true }).setChecked(label.trim() === 'Catalog');
  }
  await startAndFollow(page);
}

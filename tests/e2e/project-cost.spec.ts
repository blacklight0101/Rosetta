import type { Locator, Page } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { openStartPage, runStatus } from './support/live-run-page.js';
import { costAccountFor } from './support/seed-cost.js';
import { signInAs } from './support/sign-in.js';

// RF-1010, RF-1106, RF-428, DEC-49, P1-36: the totals pill of the header and the cost page, driven by
// the real test server. The run replays the recorded understand run of the C# fixture (serve.ts); its
// models are local, so its calls add tokens at a cost of zero. seed-cost.ts spends $8.50 of the
// server's $10.00 this month, so every administrator sees the cap banner.

const PROJECT_NAMES = ['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark'];

/**
 * Waits for a second of this project's own before the run starts: the odd seconds modulo eight, as
 * live-run-page.ts keeps the even ones, so no two runs of the e2e servers start in the same second
 * (see OPEN QUESTIONS of P1-35).
 */
async function waitForOwnOddSecond(): Promise<void> {
  const slot = Math.max(0, PROJECT_NAMES.indexOf(test.info().project.name)) * 2 + 1;
  while (Math.floor(Date.now() / 1000) % (PROJECT_NAMES.length * 2) !== slot) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** The number before "tokens" in the pill. */
async function tokensOf(pill: Locator): Promise<number> {
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
async function openScannedStartPage(page: Page): Promise<void> {
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
async function startCatalogRun(page: Page): Promise<void> {
  await page.getByLabel('Understand').check();
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(areas.locator('label').first()).toBeVisible();
  for (const label of await areas.locator('label').allTextContents()) {
    await areas.getByLabel(label.trim(), { exact: true }).setChecked(label.trim() === 'Catalog');
  }
  await startAndFollow(page);
}

test('RF-1010 the header totals follow a run live without a reload, with the breakdown one click away', async ({
  context,
  page,
}, info) => {
  // A scan when the project has none yet, then an understand run: longer than the default 30 s.
  test.setTimeout(150_000);
  await signInAs(context, costAccountFor('cost', info.project.name));
  await openScannedStartPage(page);
  const pill = page.getByTestId('header-totals');
  await expect(pill).toContainText('Your total');
  await expect(pill).toContainText(/\d tokens/u);
  const before = await tokensOf(pill);
  await page.evaluate(() => Reflect.set(globalThis, 'rstSamePage', true));

  await startCatalogRun(page);

  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  await expect.poll(() => tokensOf(pill), { timeout: 15_000 }).toBeGreaterThan(before);
  expect(await page.evaluate(() => Reflect.get(globalThis, 'rstSamePage') === true)).toBe(true);
  await expect(pill).not.toContainText('Server, this month');

  await openStartPage(page);
  await pill.getByRole('link', { name: /Your total/u }).click();
  await expect(page.getByRole('heading', { name: 'Project cost', level: 1 })).toBeVisible();
  await expect(page.getByRole('table', { name: 'By run' }).getByRole('link')).not.toHaveCount(0);
  await expect(page.getByRole('table', { name: 'By model' })).toContainText('Local');
  await expectNoSeriousViolations(page);
});

test('RF-1106 RF-1010 the administrator sees the server month against the cap and the banner from 80%', async ({
  context,
  page,
}, info) => {
  await signInAs(context, costAccountFor('cost-admin', info.project.name));

  await page.goto('/projects');

  const pill = page.getByTestId('header-totals');
  await expect(pill).toContainText('Server, this month');
  await expect(pill).toContainText(/\$[\d.]+ of \$10\.00/u);
  const banner = page.getByRole('status').filter({ hasText: 'of its monthly cap' });
  await expect(banner).toContainText(/The server has used (8[5-9]|9\d|100)% of its monthly cap/u);
  await expectNoSeriousViolations(page);
});

test('RF-1106 a user sees neither the server month nor the banner', async ({
  context,
  page,
}, info) => {
  await signInAs(context, costAccountFor('cost', info.project.name));

  await page.goto('/projects');

  await expect(page.getByTestId('header-totals')).toContainText('Your total');
  await expect(page.getByTestId('header-totals')).not.toContainText('Server, this month');
  await expect(page.getByText('of its monthly cap')).toHaveCount(0);
});

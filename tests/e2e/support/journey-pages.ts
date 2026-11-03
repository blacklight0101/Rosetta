import type { Page } from '@playwright/test';
import { expect } from './fixtures.js';
import { revealAreas } from './start-choices.js';
import { openScanRun, openStartOf } from './live-run-page.js';

// P1-46: the steps the milestone journeys share, written as a person does them: through the
// projects page, the start page and the live run page. Every repository is one the test server's
// fake GitHub knows (serve.ts).

export const repositories = {
  webforms: 'https://github.com/octo/webforms',
  ledger: 'https://github.com/octo/ledger',
  demo: 'https://github.com/octo/demo',
} as const;

/** Opens the start page of the account's project for the address, creating the project first. */
export async function openProjectStart(page: Page, url: string): Promise<void> {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  await openStartOf(page, url);
  // P8-26: a project with a run is titled with its name, not "Start a run".
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(url);
}

/** Starts a scan of the project open on the start page and waits for it to end complete. */
export async function runScan(page: Page): Promise<string> {
  await openScanRun(page);
  return new URL(page.url()).pathname;
}

/** Chooses which areas the understand run reads: only the named ones, or all when none is named. */
export async function chooseAreas(page: Page, names: readonly string[] | 'all'): Promise<void> {
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await revealAreas(page);
  // The page lists them once its estimate is read; the first run of a replaced source may still be scanning.
  await expect(areas.locator('label').first()).toBeVisible({ timeout: 60_000 });
  for (const label of await areas.locator('label').allTextContents()) {
    const name = label.trim();
    await areas
      .getByLabel(name, { exact: true })
      .setChecked(names === 'all' || names.includes(name));
  }
}

/**
 * Presses Build report on the page of an ended run and waits for the links the answer shows. The
 * answer comes after the report pages and the run zip are written, and a run with diagrams carries
 * the 5.5 MB vendored Mermaid build (RF-508): on Windows the first read of that freshly copied
 * file takes 5 to 7 s (P2-50, P2-53), so the journey with diagrams passes a longer `timeout`; the
 * others keep Playwright's 5 s.
 */
export async function buildReport(page: Page, timeout?: number): Promise<void> {
  await page.getByRole('button', { name: 'Build report' }).click();
  await expect(page.getByRole('link', { name: 'Open the run replay' })).toBeVisible(
    timeout === undefined ? undefined : { timeout },
  );
}

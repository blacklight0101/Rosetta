import type { Page } from '@playwright/test';
import { expect } from './fixtures.js';
import { openStartOf, runStatus, startAndOpenLiveRun } from './live-run-page.js';

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
  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(url);
}

/** Starts a scan of the project open on the start page and waits for it to end complete. */
export async function runScan(page: Page): Promise<string> {
  await page.getByLabel('Scan only').check();
  const path = await startAndOpenLiveRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
  return path;
}

/** Chooses which areas the understand run reads: only the named ones, or all when none is named. */
export async function chooseAreas(page: Page, names: readonly string[] | 'all'): Promise<void> {
  await expect(page.getByRole('radio', { name: 'Understand', exact: true })).toBeChecked();
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(areas.locator('label').first()).toBeVisible();
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
 * the 5.5 MB vendored Mermaid build (RF-508): on Windows the zip of that file takes 5 to 7 s
 * (P2-50), so the wait is longer than the 5 s of an ordinary expectation.
 */
export async function buildReport(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Build report' }).click();
  await expect(page.getByRole('link', { name: 'Open the run replay' })).toBeVisible({
    timeout: 30_000,
  });
}

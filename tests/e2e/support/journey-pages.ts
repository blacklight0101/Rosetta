import type { Page } from '@playwright/test';
import { expect } from './fixtures.js';
import { runStatus, startAndOpenLiveRun } from './live-run-page.js';

// P1-46: the steps the milestone journeys share, written as a person does them: through the
// projects page, the start page and the live run page. Every repository is one the test server's
// fake GitHub knows (serve.ts).

export const repositories = {
  webforms: 'https://github.com/octo/webforms',
  ledger: 'https://github.com/octo/ledger',
  demo: 'https://github.com/octo/demo',
} as const;

/** `octo/ledger` for `https://github.com/octo/ledger`. */
function nameOf(url: string): string {
  return new URL(url).pathname.slice(1);
}

/** Creates the project of a repository address on the projects page; the list then shows it. */
export async function createProject(page: Page, url: string): Promise<void> {
  await page.getByLabel('GitHub repository URL').fill(url);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(page.getByRole('link', { name: `Start run for ${nameOf(url)}` })).toBeVisible();
}

/** Opens the start page of the account's project for the address, creating the project first. */
export async function openProjectStart(page: Page, url: string): Promise<void> {
  await page.goto('/projects');
  await expect(page.getByRole('heading', { name: 'Projects', level: 1 })).toBeVisible();
  const link = page.getByRole('link', { name: `Start run for ${nameOf(url)}` });
  const loaded = link.or(page.getByText('No projects yet')).or(page.getByRole('table'));
  await expect(loaded.first()).toBeVisible();
  if ((await link.count()) === 0) await createProject(page, url);
  await link.click();
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
  await expect(page.getByLabel('Understand')).toBeChecked();
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(areas.locator('label').first()).toBeVisible();
  for (const label of await areas.locator('label').allTextContents()) {
    const name = label.trim();
    await areas
      .getByLabel(name, { exact: true })
      .setChecked(names === 'all' || names.includes(name));
  }
}

/** Presses Build report on the page of an ended run. */
export async function buildReport(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Build report' }).click();
  await expect(page.getByRole('link', { name: 'Open the run replay' })).toBeVisible();
}

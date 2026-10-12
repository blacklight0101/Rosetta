import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.js';

// RF-1002, RF-1003, RF-1004, P1-35: what the live run journeys do on the start page and on the live
// page, so the specs read as steps. The repository is `octo/webforms` (serve.ts), the C# fixture whose
// recorded understand run the test server replays.

export const webformsUrl = 'https://github.com/octo/webforms';
const startButton = { name: /^Start run/u } as const;

/** Opens the start page of the account's `octo/webforms` project, creating the project once. */
export async function openStartPage(page: Page): Promise<void> {
  await page.goto('/projects');
  const link = page.getByRole('link', { name: 'Start run for octo/webforms' });
  const empty = page.getByText('No projects yet');
  await expect(link.or(empty).first()).toBeVisible();
  if (await empty.isVisible()) {
    await page.getByLabel('GitHub repository URL').fill(webformsUrl);
    await page.getByRole('button', { name: 'Create project' }).click();
    await expect(link).toBeVisible();
  }
  await link.click();
  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(webformsUrl);
}

/** The area checkboxes of the start page. */
function areasOf(page: Page): Locator {
  return page.getByRole('group', { name: 'Areas from the code map' });
}

/** Chooses which areas an understand run reads: only the ones named. */
export async function chooseAreas(page: Page, names: readonly string[]): Promise<void> {
  await expect(page.getByLabel('Understand')).toBeChecked();
  const areas = areasOf(page);
  await expect(areas.locator('label').first()).toBeVisible();
  for (const label of await areas.locator('label').allTextContents()) {
    const name = label.trim();
    await areas.getByLabel(name, { exact: true }).setChecked(names.includes(name));
  }
}

/** Presses Start and follows the link of the notice to the live page; returns its path. */
export async function startAndOpenLiveRun(page: Page): Promise<string> {
  await page.getByRole('button', startButton).click();
  const notice = page.getByTestId('run-notice');
  await expect(notice).toContainText(/Run started|Queued/u);
  await notice.getByRole('link', { name: 'Open the live run' }).click();
  await expect(page.getByRole('heading', { name: 'Live run', level: 1 })).toBeVisible();
  return new URL(page.url()).pathname;
}

/** Starts an understand run of the named areas and opens its live page. */
export async function startUnderstand(page: Page, areas: readonly string[]): Promise<string> {
  await openStartPage(page);
  await chooseAreas(page, areas);
  return startAndOpenLiveRun(page);
}

export function agentPanel(page: Page, area: string): Locator {
  return page.getByRole('article', { name: `Agent ${area}`, exact: true });
}

/** The value beside a label in a definition list, for example `Turns` of a panel. */
export function valueOf(scope: Locator, label: string): Locator {
  return scope.locator(`dt:text-is("${label}") + dd`);
}

export function runStatus(page: Page): Locator {
  return page.getByTestId('run-status');
}

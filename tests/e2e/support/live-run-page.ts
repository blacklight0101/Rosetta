import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.js';

// RF-1002, RF-1003, RF-1004, P1-35: what the live run journeys do on the start page and on the live
// page, so the specs read as steps. The repository is `octo/webforms` (serve.ts), the C# fixture whose
// recorded understand run the test server replays.

const webformsUrl = 'https://github.com/octo/webforms';
const startButton = { name: /^Start run/u } as const;

/** The start link of the project of a repository address on the projects page. */
export function startLinkOf(page: Page, url: string): Locator {
  return page.getByRole('link', { name: `Start run for ${new URL(url).pathname.slice(1)}` });
}

/**
 * Makes sure the account has the project of a repository address, creating it when it has not.
 * Two tests of one account can run at once and both see the empty list. The second creation is
 * refused and its page keeps the empty list, so the list is read again until the project shows
 * (P1-150); the same holds when the first creation is still in flight.
 */
export async function ensureProject(page: Page, url: string): Promise<void> {
  const link = startLinkOf(page, url);
  const empty = page.getByText('No projects yet');
  await expect(link.or(empty).or(page.getByRole('table')).first()).toBeVisible();
  if ((await link.count()) > 0) return;
  await page.getByLabel('GitHub repository URL').fill(url);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(async () => {
    await page.goto('/projects');
    await expect(link).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
}

/** Opens the start page of the account's `octo/webforms` project, creating the project once. */
export async function openStartPage(page: Page): Promise<void> {
  await page.goto('/projects');
  await ensureProject(page, webformsUrl);
  await startLinkOf(page, webformsUrl).click();
  await expect(page.getByRole('heading', { name: 'Start a run', level: 1 })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(webformsUrl);
}

/** The area checkboxes of the start page. */
function areasOf(page: Page): Locator {
  return page.getByRole('group', { name: 'Areas from the code map' });
}

/** Chooses which areas an understand run reads: only the ones named. */
async function chooseAreas(page: Page, names: readonly string[]): Promise<void> {
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

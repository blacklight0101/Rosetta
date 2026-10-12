import type { Locator, Page } from '@playwright/test';
import { expect, test } from './fixtures.js';

// RF-1002, RF-1003, RF-1004, P1-35: what the live run journeys do on the start page and on the live
// page, so the specs read as steps. The repository is `octo/webforms` (serve.ts), the C# fixture whose
// recorded understand run the test server replays.

const webformsUrl = 'https://github.com/octo/webforms';
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
async function chooseAreas(page: Page, names: readonly string[]): Promise<void> {
  await expect(page.getByLabel('Understand')).toBeChecked();
  const areas = areasOf(page);
  await expect(areas.locator('label').first()).toBeVisible();
  for (const label of await areas.locator('label').allTextContents()) {
    const name = label.trim();
    await areas.getByLabel(name, { exact: true }).setChecked(names.includes(name));
  }
}

const PROJECT_NAMES = ['desktop-light', 'desktop-dark', 'phone-light', 'phone-dark'];

/**
 * Waits for a second of its own before a run starts. The key of a run is its start second plus the
 * mode, and the cost reservations of two runs that started in the same second collide on one key
 * (see OPEN QUESTIONS of P1-35), which fails the readers. The four projects run at once, each
 * starting only in the seconds that are its own modulo eight, two seconds apart.
 */
async function waitForOwnSecond(): Promise<void> {
  const slot = Math.max(0, PROJECT_NAMES.indexOf(test.info().project.name)) * 2;
  while (Math.floor(Date.now() / 1000) % (PROJECT_NAMES.length * 2) !== slot) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** Presses Start and follows the link of the notice to the live page; returns its path. */
export async function startAndOpenLiveRun(page: Page): Promise<string> {
  await waitForOwnSecond();
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

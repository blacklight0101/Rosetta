import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.js';

// RF-1002, RF-1003, RF-1004, P1-35: what the live run journeys do on the start page and on the live
// page, so the specs read as steps. The repository is `octo/webforms` (serve.ts), the C# fixture whose
// recorded understand run the test server replays.

const webformsUrl = 'https://github.com/octo/webforms';
const startButton = { name: /^Start run/u } as const;

/** The start link of the project of a repository address on the projects page. */
function startLinkOf(page: Page, url: string): Locator {
  return page.getByRole('link', { name: `Start run for ${new URL(url).pathname.slice(1)}` });
}

/** The heading of the start page of a project. */
function startHeadingOf(page: Page): Locator {
  return page.getByRole('heading', { name: 'Start a run', level: 1 });
}

/**
 * Makes sure the account has the project of a repository address, creating it when it has not.
 * A create has one of two answers, and the page waits for it where it was made (P1-150): the project
 * is added to this list, or the project already exists and the form opens its start page. Reloading
 * during the create could cancel it, or let its navigation land after the reload, so no reload is
 * made here.
 */
export async function ensureProject(page: Page, url: string): Promise<void> {
  const link = startLinkOf(page, url);
  const empty = page.getByText('No projects yet');
  await expect(link.or(empty).or(page.getByRole('table')).first()).toBeVisible();
  if ((await link.count()) > 0) return;
  await page.getByLabel('GitHub repository URL').fill(url);
  await page.getByRole('button', { name: 'Create project' }).click();
  await expect(link.or(startHeadingOf(page))).toBeVisible({ timeout: 30_000 });
}

/**
 * Opens the start page of the account's project for a repository address, creating the project
 * first. The page is either on the start page already (the answer of a create that found the project)
 * or on the projects list, where the link leads to it.
 */
export async function openStartOf(page: Page, url: string): Promise<void> {
  await ensureProject(page, url);
  if (await startHeadingOf(page).isVisible()) return;
  const link = startLinkOf(page, url);
  await expect(link).toHaveAttribute('href', /\/start$/u);
  await page.goto((await link.getAttribute('href')) ?? '/projects');
}

/** Opens the start page of the account's `octo/webforms` project, creating the project once. */
export async function openStartPage(page: Page): Promise<void> {
  await page.goto('/projects');
  await openStartOf(page, webformsUrl);
  await expect(startHeadingOf(page)).toBeVisible();
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

/**
 * Presses Start; when the likely cost is above the confirm threshold (RF-425) the run is asked
 * about first, and the question is confirmed.
 */
export async function pressStart(page: Page): Promise<void> {
  await page.getByRole('button', startButton).click();
  const question = page.getByRole('dialog', { name: 'Start this run?' });
  const notice = page.getByTestId('run-notice');
  await expect(question.or(notice)).toBeVisible();
  if (await question.isVisible()) {
    await page.getByRole('button', { name: 'Confirm and start' }).click();
  }
}

/** Presses Start and follows the link of the notice to the live page; returns its path. */
export async function startAndOpenLiveRun(page: Page): Promise<string> {
  await pressStart(page);
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

/**
 * Opens a tab of the page of a run: the cards so far, all agents or the activity while the run works
 * (P1-169), and the overview, your questions, the evidence or the activity once it has ended (P1-170).
 */
export async function openRunTab(
  page: Page,
  name: 'Cards so far' | 'All agents' | 'Activity' | 'Overview' | 'Your questions' | 'Evidence',
): Promise<void> {
  const tab = page.getByRole('tab', { name: new RegExp(`^${name}`, 'u') });
  await tab.click();
  await expect(tab).toHaveAttribute('aria-selected', 'true');
}

/**
 * RF-264, P3-81: "What was not covered" of the finished run. Controllers was not asked for; the
 * rejected claim of Services leaves it with no card that passed; the files no reader opened are
 * named, with the share of first-party tokens and the Deepen step, and the old sentence is gone.
 */
export async function expectNotCovered(covered: Locator): Promise<void> {
  await expect(covered).toContainText(/Not selected for this run \(1\)\s*Controllers/u);
  await expect(covered).toContainText(
    /No card was left after the citation check and the judgement \(1\)\s*Services/u,
  );
  const unread = /First-party files not read: \d+ files?, \d+% of first-party tokens not read\./u;
  await expect(covered).toContainText(unread);
  await expect(covered).toContainText('Next step: run a Deepen to read');
  await expect(covered).not.toContainText('Every area of the run gave at least one card.');
}

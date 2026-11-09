import type { Locator, Page } from '@playwright/test';
import { startCatalogRun, openScannedStartPage } from './cost-run.js';
import { expect } from './fixtures.js';
import { openStartOf, pressStart, RUN_DONE, runStatus } from './live-run-page.js';
import { revealAreas, showStartChoices } from './start-choices.js';

// RF-605, RF-608, RF-609, RF-613: what the Plan setup specs do on the project's pages, so the specs
// read as steps. The project is `octo/webforms` (serve.ts) and its recorded understand run, or
// `octo/inventory`, the Python project (P8-103, P8-104).

const inventoryUrl = 'https://github.com/octo/inventory';

/** Scans and understands the Catalog area of the account's project, then waits for the run. */
export async function understandCatalog(page: Page): Promise<void> {
  await openScannedStartPage(page);
  await startCatalogRun(page);
  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 60_000 });
}

/**
 * Scans and understands the account's Python project `octo/inventory` (a project that is not .NET),
 * then waits for the run and opens the project's start page again.
 */
export async function understandInventory(page: Page): Promise<void> {
  await page.goto('/projects');
  await openStartOf(page, inventoryUrl);
  await showStartChoices(page);
  await revealAreas(page);
  const areas = page.getByRole('group', { name: 'Areas from the code map' });
  await expect(areas.locator('label').first()).toBeVisible({ timeout: 60_000 });
  await pressStart(page);
  await expect(runStatus(page)).toContainText(RUN_DONE, { timeout: 60_000 });
  await page.goto('/projects');
  await openStartOf(page, inventoryUrl);
  await showStartChoices(page);
}

/** Opens Plan setup from the project's navigation (the start page is open). */
export async function openPlanSetup(page: Page): Promise<void> {
  await page.getByRole('navigation').getByRole('link', { name: 'Plan setup' }).click();
  await expect(page.getByRole('heading', { name: 'Plan setup', level: 1 })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Plan estimate' })).not.toHaveAttribute(
    'aria-busy',
    'true',
  );
}

/** The pill of a step in the row of steps. */
export function stepPill(page: Page, name: string): Locator {
  return page.getByRole('navigation', { name: 'Steps' }).getByRole('button', { name, exact: true });
}

/** Opens a step and waits until it is the current one. */
export async function openStep(page: Page, name: string): Promise<void> {
  await stepPill(page, name).click();
  await expect(stepPill(page, name)).toHaveAttribute('aria-current', 'step');
}

/**
 * Waits for the options of the planner on the architecture step: the recommended style. When the
 * page shows the refusal of the options instead, the test fails with the refusal in its message.
 */
export async function expectOptions(page: Page): Promise<Locator> {
  const recommended = page.getByRole('radio', { name: /\(Recommended\)$/u });
  const refusal = page.getByTestId('error-banner');
  await expect(recommended.or(refusal).first()).toBeVisible({ timeout: 20_000 });
  if (await refusal.first().isVisible()) {
    throw new Error(`The options were refused: ${await refusal.first().innerText()}`);
  }
  return recommended;
}

export const recorded = (page: Page): Locator =>
  page.getByRole('region', { name: 'What I recorded' });

export const estimate = (page: Page): Locator =>
  page.getByRole('region', { name: 'Plan estimate' });

export const writeButton = (page: Page): Locator =>
  page.getByRole('button', { name: /^Start the plan/u });

/**
 * Presses a save button and waits until the brief was saved. The wait is bounded, so a save that
 * never answers (one held behind the planner's options, #1202) fails here and names the save,
 * instead of running into the timeout of the whole test; 30 s, the bound of the other waits on a
 * loaded runner (P8-143).
 */
export async function saveBrief(page: Page, button: Locator): Promise<void> {
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'PUT' && response.url().endsWith('/planning-brief'),
    { timeout: 30_000 },
  );
  await button.click();
  expect((await saved).ok()).toBe(true);
}

/** Holds the planner's options request until the returned function is called, then lets it through. */
export async function holdPlanOptions(page: Page): Promise<() => void> {
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/plan-options', async (route) => {
    await held;
    await route.continue();
  });
  return release;
}

/**
 * RF-604: the live page of the plan run that Start the plan opened, waited on until the run ends
 * Completed. The run may first wait for one of the server's two run slots (RF-1108), and until it
 * ends it holds what is left of the journey's amount (RF-435, P8-03), so a later plan start of the
 * same project would be refused meanwhile (RST-2311).
 */
export async function expectPlanCompleted(page: Page): Promise<void> {
  const heading = /^(Scan|Understand|Deepen|Plan|Run)\b/u;
  await expect(page.getByRole('heading', { name: heading, level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/runs\/[0-9a-f-]{36}$/u);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 90_000 });
}

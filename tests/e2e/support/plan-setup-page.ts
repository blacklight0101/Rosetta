import type { Locator, Page } from '@playwright/test';
import { startCatalogRun, openScannedStartPage } from './cost-run.js';
import { expect } from './fixtures.js';
import { runStatus } from './live-run-page.js';

// RF-605, RF-608, RF-609, RF-613: what the Plan setup specs do on the project's pages, so the specs
// read as steps. The project is `octo/webforms` (serve.ts) and its recorded understand run.

/** Scans and understands the Catalog area of the account's project, then waits for the run. */
export async function understandCatalog(page: Page): Promise<void> {
  await openScannedStartPage(page);
  await startCatalogRun(page);
  await expect(runStatus(page)).toContainText('Completed', { timeout: 60_000 });
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

export const recorded = (page: Page): Locator =>
  page.getByRole('region', { name: 'What I recorded' });

export const estimate = (page: Page): Locator =>
  page.getByRole('region', { name: 'Plan estimate' });

export const writeButton = (page: Page): Locator =>
  page.getByRole('button', { name: /^Write the package/u });

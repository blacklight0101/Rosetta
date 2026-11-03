import type { Page } from '@playwright/test';
import { expect } from './fixtures.js';
import { showStartChoices } from './start-choices.js';

// RF-1001, P8-16: the start page of the demo project, shared by the start-run specs (moved out of
// start-run.spec.ts, which is at the file size limit).

const demoUrl = 'https://github.com/octo/demo';

/** Opens the start page of octo/demo, making the project when the account has none. */
export async function openStartPage(page: Page): Promise<void> {
  await page.goto('/projects');
  const link = page.getByRole('link', { name: 'Start run for octo/demo' });
  const empty = page.getByText('No projects yet');
  await expect(link.or(empty)).toBeVisible();
  if (await empty.isVisible()) {
    await page.getByLabel('GitHub repository URL').fill(demoUrl);
    await page.getByRole('button', { name: 'Create project' }).click();
    // P8-10: the new project opens its page by itself.
    await expect(page).toHaveURL(/\/projects\/[^/]+$/u);
  } else {
    await link.click();
  }
  // P8-26: a project with a run is titled with its name, not "Start a run".
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByLabel('GitHub repository URL')).toHaveValue(demoUrl);
  await showStartChoices(page);
}

export function projectIdOf(page: Page): string {
  const id = /\/projects\/([^/]+)$/u.exec(new URL(page.url()).pathname)?.[1];
  if (id === undefined) throw new Error(`Not a start page: ${page.url()}`);
  return id;
}

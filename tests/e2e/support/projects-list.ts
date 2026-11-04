import type { Page } from '@playwright/test';

// P8-99: the row menu of the projects list. A project's settings are one item of its "More actions"
// menu, no longer a link in the row.

/** Opens the settings of a project from its row on the projects page. */
export async function openSettingsFromList(page: Page, projectName: string): Promise<void> {
  await page.getByRole('button', { name: `More actions for ${projectName}` }).click();
  await page.getByRole('menuitem', { name: 'Project settings' }).click();
}

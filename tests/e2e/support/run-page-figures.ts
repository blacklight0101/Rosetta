import { expect, type Page } from '@playwright/test';

// RF-1015, RF-1017 (P8-27): the page of an ended Deepen run is titled by its kind and state, never
// "Live run", and shows the five figures of the run once, the cards marked as this Deepen's own.
export async function expectDeepenRunPage(page: Page): Promise<void> {
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Deepen round [0-9]+, done$/u);
  await expect(page.getByText('Live run')).toHaveCount(0);
  const figures = page.getByRole('list', { name: 'Run facts' });
  await expect(figures.getByRole('listitem')).toHaveCount(5);
  await expect(figures).toContainText('written by this Deepen');
}

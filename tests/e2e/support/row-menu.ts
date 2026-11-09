import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.js';

// P8-99, RNF-010, RF-1012: what the "More actions" menu of a table row does for a user, on the projects page
// and on History, which share the component: it opens whole in the viewport (above its button when the button
// is near the bottom), the page does not scroll sideways, and it closes on Escape (the focus returns to the
// button) and on a click elsewhere. Every wait is on what the page shows.

/** Opens the menu of `button` after scrolling the page to it, and returns the menu. */
async function openMenu(page: Page, button: Locator): Promise<Locator> {
  await button.scrollIntoViewIfNeeded();
  await button.click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(button).toHaveAttribute('aria-expanded', 'true');
  return menu;
}

/** The menu of `button` lies inside the viewport, closes on Escape and on a click elsewhere. */
export async function expectRowMenuWorks(page: Page, button: Locator): Promise<void> {
  const size = page.viewportSize();
  if (size === null) throw new Error('The page has no viewport.');
  const menu = await openMenu(page, button);
  const box = await menu.boundingBox();
  if (box === null) throw new Error('The row menu has no box.');
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(size.width);
  expect(box.y + box.height).toBeLessThanOrEqual(size.height);
  const overflow = await page.evaluate('document.documentElement.scrollWidth - window.innerWidth');
  expect(Number(overflow)).toBeLessThanOrEqual(0);
  await expect(menu.getByRole('menuitem').first()).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(button).toBeFocused();

  await openMenu(page, button);
  // The corner of the button's own row: in view already (no scroll), and nothing there to follow.
  await button.locator('xpath=ancestor::tr').click({ position: { x: 2, y: 2 } });
  await expect(page.getByRole('menu')).toHaveCount(0);
  await expect(button).toHaveAttribute('aria-expanded', 'false');
}

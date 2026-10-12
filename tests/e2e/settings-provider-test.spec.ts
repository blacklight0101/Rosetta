import type { Locator } from '@playwright/test';
import { expect, test } from './support/fixtures.js';
import { expectNoSeriousViolations } from './support/axe.js';
import { accountFor } from './support/seed.js';
import { signInAs } from './support/sign-in.js';

// RF-407, RNF-010, P1-29: the Test button of the settings page. The test server's model answers
// every role except the summariser, whose call fails with RST-1506: the page shows the first three
// roles reachable with their cost, the last one with its error code, what happened and what to do,
// and passes axe in both colour schemes and both viewports.

test.beforeEach(async ({ context, page }, info) => {
  await signInAs(context, accountFor('providers', info.project.name));
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Test providers' })).toBeVisible();
});

const resultOf = (slot: Locator, role: string): Locator =>
  slot.getByTestId('provider-test-result').filter({ hasText: role });

test('RF-407 shows nothing until the button is pressed', async ({ page }) => {
  const slot = page.getByTestId('provider-test');

  await expect(slot.getByRole('button', { name: 'Test providers' })).toBeEnabled();
  await expect(slot.getByTestId('provider-test-result')).toHaveCount(0);
});

test('RF-407 shows each role reachable or with its error, and passes axe', async ({ page }) => {
  const slot = page.getByTestId('provider-test');

  await slot.getByRole('button', { name: 'Test providers' }).click();

  await expect(slot.getByTestId('provider-test-result')).toHaveCount(4);
  for (const role of ['Reader', 'Verifier', 'Planner']) {
    await expect(resultOf(slot, role)).toContainText('Reachable');
    await expect(resultOf(slot, role)).toContainText('ollama');
  }
  await expect(resultOf(slot, 'Summariser')).toContainText('Failed');
  await expect(resultOf(slot, 'Summariser')).toContainText('RST-1506');
  await expect(slot.getByRole('button', { name: 'Test providers' })).toBeEnabled();
  await expectNoSeriousViolations(page);
});
